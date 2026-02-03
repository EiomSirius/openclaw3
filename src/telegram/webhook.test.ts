import { afterEach, describe, expect, it, vi } from "vitest";
import { startTelegramWebhook, _resetSharedServer } from "./webhook.js";

const handlerSpy = vi.fn(
  (_req: unknown, res: { writeHead: (status: number) => void; end: (body?: string) => void }) => {
    res.writeHead(200);
    res.end("ok");
  },
);
const setWebhookSpy = vi.fn();
const stopSpy = vi.fn();

const createTelegramBotSpy = vi.fn(() => ({
  api: { setWebhook: setWebhookSpy },
  stop: stopSpy,
}));

vi.mock("grammy", async (importOriginal) => {
  const actual = await importOriginal<typeof import("grammy")>();
  return { ...actual, webhookCallback: () => handlerSpy };
});

vi.mock("./bot.js", () => ({
  createTelegramBot: (...args: unknown[]) => createTelegramBotSpy(...args),
}));

describe("startTelegramWebhook", () => {
  afterEach(() => {
    _resetSharedServer();
    handlerSpy.mockClear();
    createTelegramBotSpy.mockClear();
    setWebhookSpy.mockClear();
    stopSpy.mockClear();
  });

  it("starts server, registers webhook, and serves health", async () => {
    const abort = new AbortController();
    const cfg = { bindings: [] };
    const { server } = await startTelegramWebhook({
      token: "tok",
      accountId: "opie",
      config: cfg,
      port: 0, // random free port
      abortSignal: abort.signal,
    });
    expect(createTelegramBotSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "opie",
        config: expect.objectContaining({ bindings: [] }),
      }),
    );
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("no address");
    }
    const url = `http://127.0.0.1:${address.port}`;

    const health = await fetch(`${url}/healthz`);
    expect(health.status).toBe(200);
    expect(setWebhookSpy).toHaveBeenCalled();

    abort.abort();
  });

  it("invokes webhook handler on matching path", async () => {
    const abort = new AbortController();
    const cfg = { bindings: [] };
    const { server } = await startTelegramWebhook({
      token: "tok",
      accountId: "opie",
      config: cfg,
      port: 0,
      abortSignal: abort.signal,
      path: "/hook",
    });
    expect(createTelegramBotSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "opie",
        config: expect.objectContaining({ bindings: [] }),
      }),
    );
    const addr = server.address();
    if (!addr || typeof addr === "string") {
      throw new Error("no addr");
    }
    // Non-default account gets path with accountId suffix
    await fetch(`http://127.0.0.1:${addr.port}/hook/opie`, { method: "POST" });
    expect(handlerSpy).toHaveBeenCalled();
    abort.abort();
  });

  it("shares server across multiple accounts", async () => {
    const abort1 = new AbortController();
    const abort2 = new AbortController();
    const cfg = { bindings: [] };

    // First account
    const { server: server1 } = await startTelegramWebhook({
      token: "tok1",
      accountId: "bot1",
      config: cfg,
      port: 0,
      abortSignal: abort1.signal,
    });

    const addr1 = server1.address();
    if (!addr1 || typeof addr1 === "string") {
      throw new Error("no addr");
    }
    const port = addr1.port;

    // Second account - should share the same server
    const { server: server2 } = await startTelegramWebhook({
      token: "tok2",
      accountId: "bot2",
      config: cfg,
      port, // Same port
      abortSignal: abort2.signal,
    });

    // Should be the same server instance
    expect(server1).toBe(server2);

    // Both bots should be created
    expect(createTelegramBotSpy).toHaveBeenCalledTimes(2);

    // Both paths should work
    const url = `http://127.0.0.1:${port}`;

    handlerSpy.mockClear();
    await fetch(`${url}/telegram-webhook/bot1`, { method: "POST" });
    expect(handlerSpy).toHaveBeenCalledTimes(1);

    handlerSpy.mockClear();
    await fetch(`${url}/telegram-webhook/bot2`, { method: "POST" });
    expect(handlerSpy).toHaveBeenCalledTimes(1);

    abort1.abort();
    abort2.abort();
  });

  it("default account uses base path without suffix", async () => {
    const abort = new AbortController();
    const cfg = { bindings: [] };
    const { server } = await startTelegramWebhook({
      token: "tok",
      accountId: "default",
      config: cfg,
      port: 0,
      abortSignal: abort.signal,
    });

    const addr = server.address();
    if (!addr || typeof addr === "string") {
      throw new Error("no addr");
    }

    handlerSpy.mockClear();
    // Default account should use base path without suffix
    await fetch(`http://127.0.0.1:${addr.port}/telegram-webhook`, { method: "POST" });
    expect(handlerSpy).toHaveBeenCalledTimes(1);

    abort.abort();
  });

  it("returns 404 for non-matching paths", async () => {
    const abort = new AbortController();
    const cfg = { bindings: [] };
    const { server } = await startTelegramWebhook({
      token: "tok",
      accountId: "bot1",
      config: cfg,
      port: 0,
      abortSignal: abort.signal,
    });

    const addr = server.address();
    if (!addr || typeof addr === "string") {
      throw new Error("no addr");
    }

    const response = await fetch(`http://127.0.0.1:${addr.port}/wrong-path`, { method: "POST" });
    expect(response.status).toBe(404);

    abort.abort();
  });
});
