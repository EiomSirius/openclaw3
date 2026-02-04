import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { estimateTokens } from "@mariozechner/pi-coding-agent";
import fs from "node:fs";
import path from "node:path";
import { setCliSessionId } from "../../agents/cli-session.js";
import {
  hasNonzeroUsage,
  normalizeUsage,
  type NormalizedUsage,
  type UsageLike,
} from "../../agents/usage.js";
import {
  type SessionSystemPromptReport,
  type SessionEntry,
  loadSessionStore,
  resolveSessionFilePath,
  updateSessionStoreEntry,
} from "../../config/sessions.js";
import { logVerbose } from "../../globals.js";

// Tail-scan limits for transcript fallback; keep bounded to avoid heavy IO on large sessions.
const USAGE_SCAN_BYTES = 512 * 1024;
const USAGE_SCAN_LINES = 400;
const ESTIMATE_SCAN_LINES = 600;

function resolveTranscriptPath(params: {
  storePath: string;
  sessionKey: string;
  sessionId?: string;
  sessionFile?: string;
}): string | undefined {
  const candidates: string[] = [];
  const sessionFile = params.sessionFile?.trim();
  if (sessionFile) {
    if (fs.existsSync(sessionFile)) {
      return sessionFile;
    }
    candidates.push(sessionFile);
  }

  let entry: SessionEntry | undefined;
  if (!params.sessionId || candidates.length === 0) {
    try {
      const store = loadSessionStore(params.storePath, { skipCache: true });
      entry = store[params.sessionKey] ?? store[params.sessionKey.toLowerCase()];
    } catch {
      entry = undefined;
    }
  }

  const entrySessionFile = entry?.sessionFile?.trim();
  if (entrySessionFile) {
    candidates.push(entrySessionFile);
  }

  const sessionId = params.sessionId ?? entry?.sessionId;
  if (sessionId) {
    candidates.push(path.join(path.dirname(params.storePath), `${sessionId}.jsonl`));
    candidates.push(resolveSessionFilePath(sessionId, entry));
  }

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function readUsageFromTranscript(params: {
  storePath: string;
  sessionKey: string;
  sessionId?: string;
  sessionFile?: string;
}): NormalizedUsage | undefined {
  const filePath = resolveTranscriptPath(params);
  if (!filePath) {
    return undefined;
  }

  let fd: number | null = null;
  try {
    fd = fs.openSync(filePath, "r");
    const stat = fs.fstatSync(fd);
    if (stat.size === 0) {
      return undefined;
    }
    const readStart = Math.max(0, stat.size - USAGE_SCAN_BYTES);
    const readLen = Math.min(stat.size - readStart, USAGE_SCAN_BYTES);
    const buf = Buffer.alloc(readLen);
    fs.readSync(fd, buf, 0, readLen, readStart);

    const lines = buf
      .toString("utf-8")
      .split(/\r?\n/)
      .filter((line) => line.trim());
    const tailLines = lines.slice(-USAGE_SCAN_LINES);
    for (let i = tailLines.length - 1; i >= 0; i -= 1) {
      const line = tailLines[i];
      try {
        const parsed = JSON.parse(line) as Record<string, unknown>;
        const message = parsed.message as Record<string, unknown> | undefined;
        const role = (message?.role ?? parsed.role) as string | undefined;
        if (role !== "assistant") {
          continue;
        }
        const usageRaw = (message?.usage ?? parsed.usage) as UsageLike | undefined;
        const usage = normalizeUsage(usageRaw);
        if (usage) {
          return usage;
        }
      } catch {
        // ignore malformed lines
      }
    }
  } catch {
    return undefined;
  } finally {
    if (fd !== null) {
      fs.closeSync(fd);
    }
  }

  return undefined;
}

function estimateTokensFromTranscript(params: {
  storePath: string;
  sessionKey: string;
  sessionId?: string;
  sessionFile?: string;
}): number | undefined {
  const filePath = resolveTranscriptPath(params);
  if (!filePath) {
    return undefined;
  }

  let fd: number | null = null;
  try {
    fd = fs.openSync(filePath, "r");
    const stat = fs.fstatSync(fd);
    if (stat.size === 0) {
      return undefined;
    }
    const readStart = Math.max(0, stat.size - USAGE_SCAN_BYTES);
    const readLen = Math.min(stat.size - readStart, USAGE_SCAN_BYTES);
    const buf = Buffer.alloc(readLen);
    fs.readSync(fd, buf, 0, readLen, readStart);

    const lines = buf
      .toString("utf-8")
      .split(/\r?\n/)
      .filter((line) => line.trim());
    const tailLines = lines.slice(-ESTIMATE_SCAN_LINES);
    let total = 0;
    let count = 0;

    for (const line of tailLines) {
      try {
        const parsed = JSON.parse(line) as Record<string, unknown>;
        const message = parsed.message as AgentMessage | undefined;
        if (!message || typeof message !== "object") {
          continue;
        }
        if (typeof message.role !== "string") {
          continue;
        }
        const tokens = estimateTokens(message);
        if (Number.isFinite(tokens) && tokens > 0) {
          total += tokens;
          count += 1;
        }
      } catch {
        // ignore malformed lines
      }
    }

    return count > 0 ? total : undefined;
  } catch {
    return undefined;
  } finally {
    if (fd !== null) {
      fs.closeSync(fd);
    }
  }
}

export async function persistSessionUsageUpdate(params: {
  storePath?: string;
  sessionKey?: string;
  usage?: NormalizedUsage;
  sessionId?: string;
  sessionFile?: string;
  modelUsed?: string;
  providerUsed?: string;
  contextTokensUsed?: number;
  systemPromptReport?: SessionSystemPromptReport;
  cliSessionId?: string;
  logLabel?: string;
}): Promise<void> {
  const { storePath, sessionKey } = params;
  if (!storePath || !sessionKey) {
    return;
  }

  const label = params.logLabel ? `${params.logLabel} ` : "";
  let usage = params.usage;
  let estimatedTotalTokens: number | undefined;
  if (!hasNonzeroUsage(usage)) {
    usage = readUsageFromTranscript({
      storePath,
      sessionKey,
      sessionId: params.sessionId,
      sessionFile: params.sessionFile,
    });
    if (!hasNonzeroUsage(usage)) {
      estimatedTotalTokens = estimateTokensFromTranscript({
        storePath,
        sessionKey,
        sessionId: params.sessionId,
        sessionFile: params.sessionFile,
      });
    }
  }

  if (hasNonzeroUsage(usage)) {
    try {
      await updateSessionStoreEntry({
        storePath,
        sessionKey,
        update: async (entry) => {
          const input = usage?.input ?? 0;
          const output = usage?.output ?? 0;
          const promptTokens = input + (usage?.cacheRead ?? 0) + (usage?.cacheWrite ?? 0);
          const patch: Partial<SessionEntry> = {
            inputTokens: input,
            outputTokens: output,
            totalTokens: promptTokens > 0 ? promptTokens : (usage?.total ?? input),
            modelProvider: params.providerUsed ?? entry.modelProvider,
            model: params.modelUsed ?? entry.model,
            contextTokens: params.contextTokensUsed ?? entry.contextTokens,
            systemPromptReport: params.systemPromptReport ?? entry.systemPromptReport,
            updatedAt: Date.now(),
          };
          const cliProvider = params.providerUsed ?? entry.modelProvider;
          if (params.cliSessionId && cliProvider) {
            const nextEntry = { ...entry, ...patch };
            setCliSessionId(nextEntry, cliProvider, params.cliSessionId);
            return {
              ...patch,
              cliSessionIds: nextEntry.cliSessionIds,
              claudeCliSessionId: nextEntry.claudeCliSessionId,
            };
          }
          return patch;
        },
      });
    } catch (err) {
      logVerbose(`failed to persist ${label}usage update: ${String(err)}`);
    }
    return;
  }

  if (estimatedTotalTokens && estimatedTotalTokens > 0) {
    try {
      await updateSessionStoreEntry({
        storePath,
        sessionKey,
        update: async (entry) => {
          const currentTotal = entry.totalTokens ?? 0;
          const patch: Partial<SessionEntry> = {
            modelProvider: params.providerUsed ?? entry.modelProvider,
            model: params.modelUsed ?? entry.model,
            contextTokens: params.contextTokensUsed ?? entry.contextTokens,
            systemPromptReport: params.systemPromptReport ?? entry.systemPromptReport,
            updatedAt: Date.now(),
          };
          if (estimatedTotalTokens > currentTotal) {
            patch.totalTokens = estimatedTotalTokens;
          }
          const cliProvider = params.providerUsed ?? entry.modelProvider;
          if (params.cliSessionId && cliProvider) {
            const nextEntry = { ...entry, ...patch };
            setCliSessionId(nextEntry, cliProvider, params.cliSessionId);
            return {
              ...patch,
              cliSessionIds: nextEntry.cliSessionIds,
              claudeCliSessionId: nextEntry.claudeCliSessionId,
            };
          }
          return patch;
        },
      });
    } catch (err) {
      logVerbose(`failed to persist ${label}estimated usage: ${String(err)}`);
    }
    return;
  }

  if (params.modelUsed || params.contextTokensUsed) {
    try {
      await updateSessionStoreEntry({
        storePath,
        sessionKey,
        update: async (entry) => {
          const patch: Partial<SessionEntry> = {
            modelProvider: params.providerUsed ?? entry.modelProvider,
            model: params.modelUsed ?? entry.model,
            contextTokens: params.contextTokensUsed ?? entry.contextTokens,
            systemPromptReport: params.systemPromptReport ?? entry.systemPromptReport,
            updatedAt: Date.now(),
          };
          const cliProvider = params.providerUsed ?? entry.modelProvider;
          if (params.cliSessionId && cliProvider) {
            const nextEntry = { ...entry, ...patch };
            setCliSessionId(nextEntry, cliProvider, params.cliSessionId);
            return {
              ...patch,
              cliSessionIds: nextEntry.cliSessionIds,
              claudeCliSessionId: nextEntry.claudeCliSessionId,
            };
          }
          return patch;
        },
      });
    } catch (err) {
      logVerbose(`failed to persist ${label}model/context update: ${String(err)}`);
    }
  }
}
