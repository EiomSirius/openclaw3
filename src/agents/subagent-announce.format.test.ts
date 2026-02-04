import { beforeEach, describe, expect, it, vi } from "vitest";

const callGatewayMock = vi.fn();
const runAgentStepSpy = vi.fn(async () => "announce summary");
const embeddedRunMock = {
  isEmbeddedPiRunActive: vi.fn(() => false),
  isEmbeddedPiRunStreaming: vi.fn(() => false),
  queueEmbeddedPiMessage: vi.fn(() => false),
  waitForEmbeddedPiRunEnd: vi.fn(async () => true),
};
let sessionStore: Record<string, Record<string, unknown>> = {};
let configOverride: ReturnType<(typeof import("../config/config.js"))["loadConfig"]> = {
  session: {
    mainKey: "main",
    scope: "per-sender",
  },
};

vi.mock("../gateway/call.js", () => ({
  callGateway: (req: unknown) => callGatewayMock(req),
}));

vi.mock("./tools/agent-step.js", () => ({
  readLatestAssistantReply: vi.fn(async () => "raw subagent reply"),
  runAgentStep: (params: unknown) => runAgentStepSpy(params),
}));

vi.mock("../config/sessions.js", () => ({
  loadSessionStore: vi.fn(() => sessionStore),
  resolveAgentIdFromSessionKey: () => "main",
  resolveStorePath: () => "/tmp/sessions.json",
  resolveMainSessionKey: () => "agent:main:main",
  readSessionUpdatedAt: vi.fn(() => undefined),
  recordSessionMetaFromInbound: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./pi-embedded.js", () => embeddedRunMock);

vi.mock("../config/config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config/config.js")>();
  return {
    ...actual,
    loadConfig: () => configOverride,
  };
});

describe("subagent announce formatting", () => {
  beforeEach(() => {
    callGatewayMock.mockReset();
    callGatewayMock.mockImplementation(async (req: unknown) => {
      const typed = req as { method?: string };
      if (typed.method === "agent.wait") {
        return { status: "error", startedAt: 10, endedAt: 20, error: "boom" };
      }
      if (typed.method === "sessions.patch" || typed.method === "sessions.delete") {
        return {};
      }
      if (typed.method === "chat.inject" || typed.method === "send") {
        return {};
      }
      return {};
    });
    runAgentStepSpy.mockReset().mockResolvedValue("announce summary");
    embeddedRunMock.isEmbeddedPiRunActive.mockReset().mockReturnValue(false);
    embeddedRunMock.isEmbeddedPiRunStreaming.mockReset().mockReturnValue(false);
    embeddedRunMock.queueEmbeddedPiMessage.mockReset().mockReturnValue(false);
    embeddedRunMock.waitForEmbeddedPiRunEnd.mockReset().mockResolvedValue(true);
    sessionStore = {};
    configOverride = {
      session: {
        mainKey: "main",
        scope: "per-sender",
      },
    };
  });

  it("sends instructional message to main agent with status and findings", async () => {
    const { runSubagentAnnounceFlow } = await import("./subagent-announce.js");
    await runSubagentAnnounceFlow({
      childSessionKey: "agent:main:subagent:test",
      childRunId: "run-123",
      requesterSessionKey: "agent:main:main",
      requesterDisplayKey: "main",
      task: "do thing",
      timeoutMs: 1000,
      cleanup: "keep",
      waitForCompletion: true,
      startedAt: 10,
      endedAt: 20,
    });

    expect(runAgentStepSpy).toHaveBeenCalled();
    const call = runAgentStepSpy.mock.calls[0]?.[0] as {
      sessionKey?: string;
      message?: string;
      extraSystemPrompt?: string;
    };
    const prompt = call?.extraSystemPrompt ?? "";
    expect(call?.message).toBe("Subagent announce step.");
    expect(call?.sessionKey).toContain("agent:main:announce:");
    expect(prompt).toContain("background task");
    expect(prompt).toContain("failed");
    expect(prompt).toContain("boom");
    expect(prompt).toContain("Findings:");
    expect(prompt).toContain("raw subagent reply");
    expect(prompt).toContain("Stats:");

    const injectCall = callGatewayMock.mock.calls.find(
      (entry) => (entry?.[0] as { method?: string })?.method === "chat.inject",
    );
    const injectParams = injectCall?.[0] as { params?: { message?: string } } | undefined;
    expect(injectParams?.params?.message).toBe("announce summary");
  });

  it("includes success status when outcome is ok", async () => {
    const { runSubagentAnnounceFlow } = await import("./subagent-announce.js");
    // Use waitForCompletion: false so it uses the provided outcome instead of calling agent.wait
    await runSubagentAnnounceFlow({
      childSessionKey: "agent:main:subagent:test",
      childRunId: "run-456",
      requesterSessionKey: "agent:main:main",
      requesterDisplayKey: "main",
      task: "do thing",
      timeoutMs: 1000,
      cleanup: "keep",
      waitForCompletion: false,
      startedAt: 10,
      endedAt: 20,
      outcome: { status: "ok" },
    });

    const call = runAgentStepSpy.mock.calls[0]?.[0] as { extraSystemPrompt?: string };
    const msg = call?.extraSystemPrompt ?? "";
    expect(msg).toContain("completed successfully");
  });

  it("steers announcements into an active run when queue mode is steer", async () => {
    const { runSubagentAnnounceFlow } = await import("./subagent-announce.js");
    embeddedRunMock.isEmbeddedPiRunActive.mockReturnValue(true);
    embeddedRunMock.isEmbeddedPiRunStreaming.mockReturnValue(true);
    embeddedRunMock.queueEmbeddedPiMessage.mockReturnValue(true);
    sessionStore = {
      "agent:main:main": {
        sessionId: "session-123",
        lastChannel: "whatsapp",
        lastTo: "+1555",
        queueMode: "steer",
      },
    };

    const didAnnounce = await runSubagentAnnounceFlow({
      childSessionKey: "agent:main:subagent:test",
      childRunId: "run-789",
      requesterSessionKey: "main",
      requesterDisplayKey: "main",
      task: "do thing",
      timeoutMs: 1000,
      cleanup: "keep",
      waitForCompletion: false,
      startedAt: 10,
      endedAt: 20,
      outcome: { status: "ok" },
    });

    expect(didAnnounce).toBe(true);
    expect(embeddedRunMock.queueEmbeddedPiMessage).not.toHaveBeenCalled();
    await expect.poll(() => runAgentStepSpy.mock.calls.length).toBe(1);
    const sendCall = callGatewayMock.mock.calls.find(
      (entry) => (entry?.[0] as { method?: string })?.method === "send",
    );
    const sendParams = sendCall?.[0] as
      | {
          params?: { channel?: string; to?: string };
        }
      | undefined;
    expect(sendParams?.params?.channel).toBe("whatsapp");
    expect(sendParams?.params?.to).toBe("+1555");
  });

  it("queues announce delivery with origin account routing", async () => {
    const { runSubagentAnnounceFlow } = await import("./subagent-announce.js");
    embeddedRunMock.isEmbeddedPiRunActive.mockReturnValue(true);
    embeddedRunMock.isEmbeddedPiRunStreaming.mockReturnValue(false);
    sessionStore = {
      "agent:main:main": {
        sessionId: "session-456",
        lastChannel: "whatsapp",
        lastTo: "+1555",
        lastAccountId: "kev",
        queueMode: "collect",
        queueDebounceMs: 0,
      },
    };

    const didAnnounce = await runSubagentAnnounceFlow({
      childSessionKey: "agent:main:subagent:test",
      childRunId: "run-999",
      requesterSessionKey: "main",
      requesterDisplayKey: "main",
      task: "do thing",
      timeoutMs: 1000,
      cleanup: "keep",
      waitForCompletion: false,
      startedAt: 10,
      endedAt: 20,
      outcome: { status: "ok" },
    });

    expect(didAnnounce).toBe(true);
    await expect
      .poll(() =>
        callGatewayMock.mock.calls.some(
          (entry) => (entry?.[0] as { method?: string })?.method === "send",
        ),
      )
      .toBe(true);

    const call = callGatewayMock.mock.calls.find(
      (entry) => (entry?.[0] as { method?: string })?.method === "send",
    );
    const params = call?.[0] as { params?: Record<string, unknown> } | undefined;
    expect(params?.params?.channel).toBe("whatsapp");
    expect(params?.params?.to).toBe("+1555");
    expect(params?.params?.accountId).toBe("kev");
  });

  it("splits collect-mode queues when accountId differs", async () => {
    const { runSubagentAnnounceFlow } = await import("./subagent-announce.js");
    embeddedRunMock.isEmbeddedPiRunActive.mockReturnValue(true);
    embeddedRunMock.isEmbeddedPiRunStreaming.mockReturnValue(false);
    sessionStore = {
      "agent:main:main": {
        sessionId: "session-acc-split",
        lastChannel: "whatsapp",
        lastTo: "+1555",
        queueMode: "collect",
        queueDebounceMs: 80,
      },
    };

    await Promise.all([
      runSubagentAnnounceFlow({
        childSessionKey: "agent:main:subagent:test-a",
        childRunId: "run-a",
        requesterSessionKey: "main",
        requesterDisplayKey: "main",
        requesterOrigin: { accountId: "acct-a" },
        task: "do thing",
        timeoutMs: 1000,
        cleanup: "keep",
        waitForCompletion: false,
        startedAt: 10,
        endedAt: 20,
        outcome: { status: "ok" },
      }),
      runSubagentAnnounceFlow({
        childSessionKey: "agent:main:subagent:test-b",
        childRunId: "run-b",
        requesterSessionKey: "main",
        requesterDisplayKey: "main",
        requesterOrigin: { accountId: "acct-b" },
        task: "do thing",
        timeoutMs: 1000,
        cleanup: "keep",
        waitForCompletion: false,
        startedAt: 10,
        endedAt: 20,
        outcome: { status: "ok" },
      }),
    ]);

    await new Promise((r) => setTimeout(r, 120));
    const sendCalls = callGatewayMock.mock.calls.filter(
      (entry) => (entry?.[0] as { method?: string })?.method === "send",
    );
    expect(sendCalls).toHaveLength(2);
    const accountIds = sendCalls.map(
      (call) => (call?.[0] as { params?: { accountId?: string } })?.params?.accountId,
    );
    expect(accountIds).toEqual(expect.arrayContaining(["acct-a", "acct-b"]));
  });

  it("uses requester origin for direct announce when not queued", async () => {
    const { runSubagentAnnounceFlow } = await import("./subagent-announce.js");
    embeddedRunMock.isEmbeddedPiRunActive.mockReturnValue(false);
    embeddedRunMock.isEmbeddedPiRunStreaming.mockReturnValue(false);

    const didAnnounce = await runSubagentAnnounceFlow({
      childSessionKey: "agent:main:subagent:test",
      childRunId: "run-direct",
      requesterSessionKey: "agent:main:main",
      requesterOrigin: { channel: "whatsapp", accountId: "acct-123", to: "+1555" },
      requesterDisplayKey: "main",
      task: "do thing",
      timeoutMs: 1000,
      cleanup: "keep",
      waitForCompletion: false,
      startedAt: 10,
      endedAt: 20,
      outcome: { status: "ok" },
    });

    expect(didAnnounce).toBe(true);
    const call = callGatewayMock.mock.calls.find(
      (entry) => (entry?.[0] as { method?: string })?.method === "send",
    );
    const params = call?.[0] as { params?: Record<string, unknown> } | undefined;
    expect(params?.params?.channel).toBe("whatsapp");
    expect(params?.params?.accountId).toBe("acct-123");
    expect(params?.params?.to).toBe("+1555");
  });

  it("normalizes requesterOrigin for direct announce delivery", async () => {
    const { runSubagentAnnounceFlow } = await import("./subagent-announce.js");
    embeddedRunMock.isEmbeddedPiRunActive.mockReturnValue(false);
    embeddedRunMock.isEmbeddedPiRunStreaming.mockReturnValue(false);

    const didAnnounce = await runSubagentAnnounceFlow({
      childSessionKey: "agent:main:subagent:test",
      childRunId: "run-direct-origin",
      requesterSessionKey: "agent:main:main",
      requesterOrigin: { channel: " whatsapp ", accountId: " acct-987 ", to: " +1444 " },
      requesterDisplayKey: "main",
      task: "do thing",
      timeoutMs: 1000,
      cleanup: "keep",
      waitForCompletion: false,
      startedAt: 10,
      endedAt: 20,
      outcome: { status: "ok" },
    });

    expect(didAnnounce).toBe(true);
    const call = callGatewayMock.mock.calls.find(
      (entry) => (entry?.[0] as { method?: string })?.method === "send",
    );
    const params = call?.[0] as { params?: Record<string, unknown> } | undefined;
    expect(params?.params?.channel).toBe("whatsapp");
    expect(params?.params?.accountId).toBe("acct-987");
    expect(params?.params?.to).toBe("+1444");
  });

  it("prefers requesterOrigin channel over stale session lastChannel in queued announce", async () => {
    const { runSubagentAnnounceFlow } = await import("./subagent-announce.js");
    embeddedRunMock.isEmbeddedPiRunActive.mockReturnValue(true);
    embeddedRunMock.isEmbeddedPiRunStreaming.mockReturnValue(false);
    // Session store has stale whatsapp channel, but the requesterOrigin says bluebubbles.
    sessionStore = {
      "agent:main:main": {
        sessionId: "session-stale",
        lastChannel: "whatsapp",
        queueMode: "collect",
        queueDebounceMs: 0,
      },
    };

    const didAnnounce = await runSubagentAnnounceFlow({
      childSessionKey: "agent:main:subagent:test",
      childRunId: "run-stale-channel",
      requesterSessionKey: "main",
      requesterOrigin: { channel: "bluebubbles", to: "bluebubbles:chat_guid:123" },
      requesterDisplayKey: "main",
      task: "do thing",
      timeoutMs: 1000,
      cleanup: "keep",
      waitForCompletion: false,
      startedAt: 10,
      endedAt: 20,
      outcome: { status: "ok" },
    });

    expect(didAnnounce).toBe(true);
    await expect
      .poll(() =>
        callGatewayMock.mock.calls.some(
          (entry) => (entry?.[0] as { method?: string })?.method === "send",
        ),
      )
      .toBe(true);

    const call = callGatewayMock.mock.calls.find(
      (entry) => (entry?.[0] as { method?: string })?.method === "send",
    );
    const params = call?.[0] as { params?: Record<string, unknown> } | undefined;
    // The channel should match requesterOrigin, NOT the stale session entry.
    expect(params?.params?.channel).toBe("bluebubbles");
    expect(params?.params?.to).toBe("bluebubbles:chat_guid:123");
  });

  it("splits collect-mode announces when accountId differs", async () => {
    const { runSubagentAnnounceFlow } = await import("./subagent-announce.js");
    embeddedRunMock.isEmbeddedPiRunActive.mockReturnValue(true);
    embeddedRunMock.isEmbeddedPiRunStreaming.mockReturnValue(false);
    sessionStore = {
      "agent:main:main": {
        sessionId: "session-789",
        lastChannel: "whatsapp",
        lastTo: "+1555",
        queueMode: "collect",
        queueDebounceMs: 0,
      },
    };

    await runSubagentAnnounceFlow({
      childSessionKey: "agent:main:subagent:test",
      childRunId: "run-a",
      requesterSessionKey: "main",
      requesterOrigin: { accountId: "acct-a" },
      requesterDisplayKey: "main",
      task: "do thing",
      timeoutMs: 1000,
      cleanup: "keep",
      waitForCompletion: false,
      startedAt: 10,
      endedAt: 20,
      outcome: { status: "ok" },
    });

    await runSubagentAnnounceFlow({
      childSessionKey: "agent:main:subagent:test",
      childRunId: "run-b",
      requesterSessionKey: "main",
      requesterOrigin: { accountId: "acct-b" },
      requesterDisplayKey: "main",
      task: "do thing",
      timeoutMs: 1000,
      cleanup: "keep",
      waitForCompletion: false,
      startedAt: 10,
      endedAt: 20,
      outcome: { status: "ok" },
    });

    await expect
      .poll(
        () =>
          callGatewayMock.mock.calls.filter(
            (entry) => (entry?.[0] as { method?: string })?.method === "send",
          ).length,
      )
      .toBe(2);

    const sendCalls = callGatewayMock.mock.calls.filter(
      (entry) => (entry?.[0] as { method?: string })?.method === "send",
    );
    const accountIds = sendCalls.map(
      (call) => (call[0] as { params?: Record<string, unknown> }).params?.accountId,
    );
    expect(accountIds).toContain("acct-a");
    expect(accountIds).toContain("acct-b");
  });
});
