import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { estimateTokens } from "@mariozechner/pi-coding-agent";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadSessionStore } from "../../config/sessions.js";
import { persistSessionUsageUpdate } from "./session-usage.js";

describe("persistSessionUsageUpdate", () => {
  it("falls back to transcript usage when usage is missing", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-session-usage-"));
    const storePath = path.join(root, "sessions.json");
    const sessionId = "sess-1";
    const sessionKey = "agent:main:main";
    const sessionFile = path.join(root, `${sessionId}.jsonl`);

    const store = {
      [sessionKey]: {
        sessionId,
        updatedAt: Date.now(),
        sessionFile,
      },
    };
    await fs.writeFile(storePath, JSON.stringify(store, null, 2), "utf-8");

    const transcriptEntries = [
      {
        type: "message",
        message: {
          role: "assistant",
          usage: {
            input: 10,
            output: 5,
            cacheRead: 2,
            cacheWrite: 3,
          },
        },
      },
    ];
    await fs.writeFile(
      sessionFile,
      transcriptEntries.map((entry) => JSON.stringify(entry)).join("\n"),
      "utf-8",
    );

    await persistSessionUsageUpdate({
      storePath,
      sessionKey,
      sessionId,
      sessionFile,
      usage: undefined,
      modelUsed: "gpt-4",
      providerUsed: "openai",
      contextTokensUsed: 4096,
    });

    const updated = loadSessionStore(storePath, { skipCache: true });
    expect(updated[sessionKey]?.inputTokens).toBe(10);
    expect(updated[sessionKey]?.outputTokens).toBe(5);
    const expectedTotal = 10 + 2 + 3;
    expect(updated[sessionKey]?.totalTokens).toBe(expectedTotal);
  });

  it("estimates tokens when transcript usage is unavailable", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-session-usage-estimate-"));
    const storePath = path.join(root, "sessions.json");
    const sessionId = "sess-2";
    const sessionKey = "agent:main:main";
    const sessionFile = path.join(root, `${sessionId}.jsonl`);

    const store = {
      [sessionKey]: {
        sessionId,
        updatedAt: Date.now(),
        sessionFile,
      },
    };
    await fs.writeFile(storePath, JSON.stringify(store, null, 2), "utf-8");

    const userMessage: AgentMessage = {
      role: "user",
      content: [{ type: "text", text: "Hello there" }],
      timestamp: Date.now(),
    };
    const assistantMessage: AgentMessage = {
      role: "assistant",
      content: [{ type: "text", text: "Hi! How can I help?" }],
      timestamp: Date.now(),
    };

    const transcriptEntries = [
      { type: "message", message: userMessage },
      { type: "message", message: assistantMessage },
    ];
    await fs.writeFile(
      sessionFile,
      transcriptEntries.map((entry) => JSON.stringify(entry)).join("\n"),
      "utf-8",
    );

    await persistSessionUsageUpdate({
      storePath,
      sessionKey,
      sessionId,
      sessionFile,
      usage: undefined,
    });

    const updated = loadSessionStore(storePath, { skipCache: true });
    const expected = estimateTokens(userMessage) + estimateTokens(assistantMessage);
    expect(updated[sessionKey]?.totalTokens).toBe(expected);
    expect(updated[sessionKey]?.inputTokens).toBeUndefined();
    expect(updated[sessionKey]?.outputTokens).toBeUndefined();
  });
});
