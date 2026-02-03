import { render } from "lit";
import { describe, expect, it, vi } from "vitest";
import type { SessionsListResult } from "../types";
import { renderChat, type ChatProps } from "./chat";

function createSessions(): SessionsListResult {
  return {
    ts: 0,
    path: "",
    count: 0,
    defaults: { model: null, contextTokens: null },
    sessions: [],
  };
}

function createProps(overrides: Partial<ChatProps> = {}): ChatProps {
  return {
    sessionKey: "main",
    onSessionKeyChange: () => undefined,
    thinkingLevel: null,
    showThinking: false,
    loading: false,
    sending: false,
    canAbort: false,
    compactionStatus: null,
    messages: [],
    toolMessages: [],
    stream: null,
    streamStartedAt: null,
    assistantAvatarUrl: null,
    draft: "",
    queue: [],
    connected: true,
    canSend: true,
    disabledReason: null,
    error: null,
    sessions: createSessions(),
    focusMode: false,
    assistantName: "OpenClaw",
    assistantAvatar: null,
    onRefresh: () => undefined,
    onToggleFocusMode: () => undefined,
    onDraftChange: () => undefined,
    onSend: () => undefined,
    onQueueRemove: () => undefined,
    onNewSession: () => undefined,
    ...overrides,
  };
}

describe("chat view", () => {
  it("shows a stop button when aborting is available", () => {
    const container = document.createElement("div");
    const onAbort = vi.fn();
    render(
      renderChat(
        createProps({
          canAbort: true,
          onAbort,
        }),
      ),
      container,
    );

    const stopButton = Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.textContent?.trim() === "Stop",
    );
    expect(stopButton).not.toBeUndefined();
    stopButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onAbort).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain("New session");
  });

  it("shows a new session button when aborting is unavailable", () => {
    const container = document.createElement("div");
    const onNewSession = vi.fn();
    render(
      renderChat(
        createProps({
          canAbort: false,
          onNewSession,
        }),
      ),
      container,
    );

    const newSessionButton = Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.textContent?.trim() === "New session",
    );
    expect(newSessionButton).not.toBeUndefined();
    newSessionButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onNewSession).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain("Stop");
  });

  describe("slash commands", () => {
    it("shows suggestions when draft starts with /", () => {
      const container = document.createElement("div");
      render(
        renderChat(
          createProps({
            draft: "/",
          }),
        ),
        container,
      );

      const suggestions = container.querySelector(".chat-slash-commands");
      expect(suggestions).not.toBeNull();
      const items = container.querySelectorAll(".chat-slash-command-item");
      expect(items.length).toBeGreaterThan(0);
    });

    it("hides suggestions when draft does not start with /", () => {
      const container = document.createElement("div");
      render(
        renderChat(
          createProps({
            draft: "hello",
          }),
        ),
        container,
      );

      const suggestions = container.querySelector(".chat-slash-commands");
      expect(suggestions).toBeNull();
    });

    it("filters suggestions based on query", () => {
      const container = document.createElement("div");
      render(
        renderChat(
          createProps({
            draft: "/sta",
          }),
        ),
        container,
      );

      const items = container.querySelectorAll(".chat-slash-command-item__cmd");
      const texts = Array.from(items).map((el) => el.textContent);
      expect(texts).toContain("/status");
      expect(texts).not.toContain("/new");
    });
  });

  describe("history navigation", () => {
    it("navigates history with arrow keys", () => {
      const container = document.createElement("div");
      const onDraftChange = vi.fn();
      const onSetCommandHistoryIndex = vi.fn();
      const history = ["/last", "/first"];

      render(
        renderChat(
          createProps({
            draft: "",
            commandHistory: history,
            commandHistoryIndex: -1,
            onDraftChange,
            onSetCommandHistoryIndex,
          }),
        ),
        container,
      );

      const textarea = container.querySelector("textarea");
      expect(textarea).not.toBeNull();

      // Up arrow -> goes to latest history (index 0)
      textarea?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
      expect(onSetCommandHistoryIndex).toHaveBeenCalledWith(0);
      expect(onDraftChange).toHaveBeenCalledWith("/last");
    });
  });
});
