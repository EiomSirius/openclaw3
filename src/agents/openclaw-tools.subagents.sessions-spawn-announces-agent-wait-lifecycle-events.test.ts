import { beforeEach, describe, expect, it, vi } from "vitest";

const callGatewayMock = vi.fn();
const runAgentStepMock = vi.fn(async () => "announce summary");
const readLatestAssistantReplyMock = vi.fn(async () => "raw subagent reply");
vi.mock("../gateway/call.js", () => ({
  callGateway: (opts: unknown) => callGatewayMock(opts),
}));
vi.mock("./tools/agent-step.js", () => ({
  readLatestAssistantReply: (...args: unknown[]) => readLatestAssistantReplyMock(...args),
  runAgentStep: (...args: unknown[]) => runAgentStepMock(...args),
}));

let configOverride: ReturnType<(typeof import("../config/config.js"))["loadConfig"]> = {
  session: {
    mainKey: "main",
    scope: "per-sender",
  },
};

vi.mock("../config/config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config/config.js")>();
  return {
    ...actual,
    loadConfig: () => configOverride,
    resolveGatewayPort: () => 18789,
  };
});

import "./test-helpers/fast-core-tools.js";
import { sleep } from "../utils.js";
import { createOpenClawTools } from "./openclaw-tools.js";
import { resetSubagentRegistryForTests } from "./subagent-registry.js";

describe("openclaw-tools: subagents", () => {
  beforeEach(() => {
    runAgentStepMock.mockReset().mockResolvedValue("announce summary");
    readLatestAssistantReplyMock.mockReset().mockResolvedValue("raw subagent reply");
    configOverride = {
      session: {
        mainKey: "main",
        scope: "per-sender",
      },
    };
  });

  it("sessions_spawn deletes session when cleanup=delete via agent.wait", async () => {
    resetSubagentRegistryForTests();
    callGatewayMock.mockReset();
    const calls: Array<{ method?: string; params?: unknown }> = [];
    let agentCallCount = 0;
    let deletedKey: string | undefined;
    let childRunId: string | undefined;
    let childSessionKey: string | undefined;
    const waitCalls: Array<{ runId?: string; timeoutMs?: number }> = [];

    callGatewayMock.mockImplementation(async (opts: unknown) => {
      const request = opts as { method?: string; params?: unknown };
      calls.push(request);
      if (request.method === "agent") {
        agentCallCount += 1;
        const runId = `run-${agentCallCount}`;
        const params = request.params as {
          message?: string;
          sessionKey?: string;
          channel?: string;
          timeout?: number;
          lane?: string;
        };
        // Only capture the first agent call (subagent spawn, not main agent trigger)
        if (params?.lane === "subagent") {
          childRunId = runId;
          childSessionKey = params?.sessionKey ?? "";
          expect(params?.channel).toBe("discord");
          expect(params?.timeout).toBe(1);
        }
        return {
          runId,
          status: "accepted",
          acceptedAt: 2000 + agentCallCount,
        };
      }
      if (request.method === "agent.wait") {
        const params = request.params as { runId?: string; timeoutMs?: number } | undefined;
        waitCalls.push(params ?? {});
        return {
          runId: params?.runId ?? "run-1",
          status: "ok",
          startedAt: 3000,
          endedAt: 4000,
        };
      }
      if (request.method === "sessions.delete") {
        const params = request.params as { key?: string } | undefined;
        deletedKey = params?.key;
        return { ok: true };
      }
      if (request.method === "chat.inject" || request.method === "send") {
        return {};
      }
      return {};
    });

    const tool = createOpenClawTools({
      agentSessionKey: "discord:group:req",
      agentChannel: "discord",
    }).find((candidate) => candidate.name === "sessions_spawn");
    if (!tool) {
      throw new Error("missing sessions_spawn tool");
    }

    const result = await tool.execute("call1b", {
      task: "do thing",
      runTimeoutSeconds: 1,
      cleanup: "delete",
    });
    expect(result.details).toMatchObject({
      status: "accepted",
      runId: "run-1",
    });

    await sleep(0);
    await sleep(0);
    await sleep(0);

    const childWait = waitCalls.find((call) => call.runId === childRunId);
    expect(childWait?.timeoutMs).toBe(1000);
    expect(childSessionKey?.startsWith("agent:main:subagent:")).toBe(true);

    // One agent call: subagent spawn (announce summary handled via runAgentStep + delivery)
    const agentCalls = calls.filter((call) => call.method === "agent");
    expect(agentCalls).toHaveLength(1);

    // First call: subagent spawn
    const first = agentCalls[0]?.params as { lane?: string } | undefined;
    expect(first?.lane).toBe("subagent");

    const stepCall = runAgentStepMock.mock.calls[0]?.[0] as
      | { extraSystemPrompt?: string }
      | undefined;
    expect(stepCall?.extraSystemPrompt).toContain("background task");

    const deliveryCalls = calls.filter((c) => c.method === "send" || c.method === "chat.inject");
    expect(deliveryCalls.length).toBe(1);

    // Session should be deleted
    expect(deletedKey?.startsWith("agent:main:subagent:")).toBe(true);
  });
});
