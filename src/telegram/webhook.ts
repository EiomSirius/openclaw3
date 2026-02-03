import type { Bot } from "grammy";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { webhookCallback } from "grammy";
import { createServer } from "node:http";
import type { OpenClawConfig } from "../config/config.js";
import type { RuntimeEnv } from "../runtime.js";
import { isDiagnosticsEnabled } from "../infra/diagnostic-events.js";
import { formatErrorMessage } from "../infra/errors.js";
import {
  logWebhookError,
  logWebhookProcessed,
  logWebhookReceived,
  startDiagnosticHeartbeat,
  stopDiagnosticHeartbeat,
} from "../logging/diagnostic.js";
import { defaultRuntime } from "../runtime.js";
import { resolveTelegramAllowedUpdates } from "./allowed-updates.js";
import { withTelegramApiErrorLogging } from "./api-logging.js";
import { createTelegramBot } from "./bot.js";

type WebhookHandler = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;

type BotEntry = {
  bot: Bot;
  handler: WebhookHandler;
  accountId: string;
  path: string;
  secret?: string;
  shutdown: () => void;
};

type SharedServerState = {
  server: Server;
  port: number;
  host: string;
  healthPath: string;
  bots: Map<string, BotEntry>;
  diagnosticsEnabled: boolean;
  runtime: RuntimeEnv;
  refCount: number;
};

// Singleton shared server instance
let sharedServer: SharedServerState | null = null;

function getActualPort(server: Server): number | null {
  const addr = server.address();
  if (!addr || typeof addr === "string") {
    return null;
  }
  return addr.port;
}

function getOrCreateSharedServer(opts: {
  port: number;
  host: string;
  healthPath: string;
  runtime: RuntimeEnv;
  diagnosticsEnabled: boolean;
}): { state: SharedServerState; isNew: boolean } {
  if (sharedServer) {
    // Get actual port from server (handle port 0 case)
    const actualPort = getActualPort(sharedServer.server) ?? sharedServer.port;
    const requestedPort = opts.port === 0 ? actualPort : opts.port;

    // Reuse existing server if port/host match (or requested port is 0)
    if ((requestedPort === actualPort || opts.port === 0) && sharedServer.host === opts.host) {
      // Validate healthPath matches
      if (opts.healthPath !== sharedServer.healthPath) {
        throw new Error(
          `Webhook server healthPath mismatch: existing=${sharedServer.healthPath}, requested=${opts.healthPath}. ` +
            `All Telegram accounts must use the same healthPath.`,
        );
      }
      return { state: sharedServer, isNew: false };
    }
    // Different port/host requested - this is a configuration error
    throw new Error(
      `Webhook server already running on ${sharedServer.host}:${actualPort}, ` +
        `cannot start another on ${opts.host}:${opts.port}. ` +
        `Configure all Telegram accounts to use the same webhookPort or remove webhookUrl from some accounts.`,
    );
  }

  const bots = new Map<string, BotEntry>();

  const server = createServer((req, res) => {
    // Health check endpoint
    if (req.url === opts.healthPath) {
      res.writeHead(200);
      res.end("ok");
      return;
    }

    // Find matching bot handler by path
    const reqPath = req.url?.split("?")[0] ?? "";
    let matchedEntry: BotEntry | undefined;
    for (const entry of bots.values()) {
      if (reqPath === entry.path) {
        matchedEntry = entry;
        break;
      }
    }

    if (!matchedEntry || req.method !== "POST") {
      res.writeHead(404);
      res.end();
      return;
    }

    const startTime = Date.now();
    const accountId = matchedEntry.accountId;

    if (opts.diagnosticsEnabled) {
      logWebhookReceived({
        channel: "telegram",
        updateType: "telegram-post",
      });
    }

    const handled = matchedEntry.handler(req, res);
    if (handled && typeof (handled as Promise<void>).catch === "function") {
      void (handled as Promise<void>)
        .then(() => {
          if (opts.diagnosticsEnabled) {
            logWebhookProcessed({
              channel: "telegram",
              updateType: "telegram-post",
              durationMs: Date.now() - startTime,
            });
          }
        })
        .catch((err) => {
          const errMsg = formatErrorMessage(err);
          if (opts.diagnosticsEnabled) {
            logWebhookError({
              channel: "telegram",
              updateType: "telegram-post",
              error: errMsg,
            });
          }
          opts.runtime.log?.(`[${accountId}] webhook handler failed: ${errMsg}`);
          if (!res.headersSent) {
            res.writeHead(500);
          }
          res.end();
        });
    }
  });

  if (opts.diagnosticsEnabled) {
    startDiagnosticHeartbeat();
  }

  sharedServer = {
    server,
    port: opts.port,
    host: opts.host,
    healthPath: opts.healthPath,
    bots,
    diagnosticsEnabled: opts.diagnosticsEnabled,
    runtime: opts.runtime,
    refCount: 0,
  };

  return { state: sharedServer, isNew: true };
}

function removeFromSharedServer(accountId: string): void {
  if (!sharedServer) {
    return;
  }

  const entry = sharedServer.bots.get(accountId);
  if (entry) {
    void entry.bot.stop();
    sharedServer.bots.delete(accountId);
  }

  sharedServer.refCount--;

  // Close server when all bots are removed
  if (sharedServer.refCount <= 0 || sharedServer.bots.size === 0) {
    sharedServer.server.close();
    if (sharedServer.diagnosticsEnabled) {
      stopDiagnosticHeartbeat();
    }
    sharedServer = null;
  }
}

export async function startTelegramWebhook(opts: {
  token: string;
  accountId?: string;
  config?: OpenClawConfig;
  path?: string;
  port?: number;
  host?: string;
  secret?: string;
  runtime?: RuntimeEnv;
  fetch?: typeof fetch;
  abortSignal?: AbortSignal;
  healthPath?: string;
  publicUrl?: string;
}) {
  const accountId = opts.accountId ?? "default";
  // Each account gets a unique path based on accountId
  const basePath = opts.path ?? "/telegram-webhook";
  const path = accountId === "default" ? basePath : `${basePath}/${accountId}`;
  const healthPath = opts.healthPath ?? "/healthz";
  const port = opts.port ?? 8787;
  const host = opts.host ?? "0.0.0.0";
  const runtime = opts.runtime ?? defaultRuntime;
  const diagnosticsEnabled = isDiagnosticsEnabled(opts.config);

  // Get or create shared server
  const { state, isNew } = getOrCreateSharedServer({
    port,
    host,
    healthPath,
    runtime,
    diagnosticsEnabled,
  });

  // Check if this account is already registered (don't increment refCount for duplicates)
  if (state.bots.has(accountId)) {
    runtime.log?.(`[${accountId}] webhook already registered on ${path}`);
    const existing = state.bots.get(accountId)!;
    return { server: state.server, bot: existing.bot, stop: existing.shutdown };
  }

  // Increment refCount only when actually adding a new bot
  state.refCount++;

  // Create bot for this account
  const bot = createTelegramBot({
    token: opts.token,
    runtime,
    proxyFetch: opts.fetch,
    config: opts.config,
    accountId: opts.accountId,
  });

  const handler = webhookCallback(bot, "http", {
    secretToken: opts.secret,
  });

  // Register bot with shared server
  const shutdown = () => {
    removeFromSharedServer(accountId);
  };

  const entry: BotEntry = {
    bot,
    handler,
    accountId,
    path,
    secret: opts.secret,
    shutdown,
  };

  state.bots.set(accountId, entry);

  // Start server if not already listening (must happen before computing publicUrl for port 0 case)
  if (!state.server.listening) {
    await new Promise<void>((resolve) => state.server.listen(port, host, resolve));
    const actualPort = getActualPort(state.server) ?? port;
    runtime.log?.(`webhook server listening on ${host}:${actualPort}`);
  }

  // Compute public URL using actual bound port (handles port 0 case)
  const actualPort = getActualPort(state.server) ?? port;
  const publicUrl =
    opts.publicUrl ?? `http://${host === "0.0.0.0" ? "localhost" : host}:${actualPort}${path}`;

  // Set webhook with Telegram
  await withTelegramApiErrorLogging({
    operation: "setWebhook",
    runtime,
    fn: () =>
      bot.api.setWebhook(publicUrl, {
        secret_token: opts.secret,
        allowed_updates: resolveTelegramAllowedUpdates(),
      }),
  });

  runtime.log?.(`[${accountId}] webhook registered on ${publicUrl}`);

  if (opts.abortSignal) {
    opts.abortSignal.addEventListener("abort", shutdown, { once: true });
  }

  return { server: state.server, bot, stop: shutdown };
}

// Export for testing
export function _resetSharedServer(): void {
  if (sharedServer) {
    sharedServer.server.close();
    sharedServer = null;
  }
}
