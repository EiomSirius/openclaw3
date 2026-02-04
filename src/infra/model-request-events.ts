/**
 * Model Request Events - Real-time tracking of model API calls
 *
 * This module provides a mechanism to emit and listen to model request lifecycle events,
 * enabling real-time visibility into API call success/failure in the Control UI.
 */

export type ModelRequestStatus = "pending" | "success" | "error";

export type ModelRequestEvent = {
  id: string;
  ts: number;
  status: ModelRequestStatus;
  sessionKey?: string;
  sessionId?: string;
  channel?: string;
  provider?: string;
  model?: string;
  // Timing
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  // Usage (populated on success)
  usage?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    total?: number;
  };
  context?: {
    limit?: number;
    used?: number;
  };
  costUsd?: number;
  // Error info (populated on error)
  error?: {
    code?: string;
    message: string;
    httpStatus?: number;
    retryable?: boolean;
  };
  // Retry info
  attempt?: number;
  maxAttempts?: number;
  // Request metadata
  requestType?: "chat" | "completion" | "embedding" | "other";
  promptTokens?: number;
};

export type ModelRequestEventInput = Omit<ModelRequestEvent, "ts">;

const listeners = new Set<(evt: ModelRequestEvent) => void>();
const recentRequests = new Map<string, ModelRequestEvent>();
const MAX_RECENT_REQUESTS = 100;

let enabled = false;

export function setModelRequestEventsEnabled(value: boolean): void {
  enabled = value;
}

export function isModelRequestEventsEnabled(): boolean {
  return enabled;
}

export function emitModelRequestEvent(event: ModelRequestEventInput): void {
  if (!enabled) {
    return;
  }

  const enriched: ModelRequestEvent = {
    ...event,
    ts: Date.now(),
  };

  // Store in recent requests map
  recentRequests.set(event.id, enriched);

  // Prune old requests if needed
  if (recentRequests.size > MAX_RECENT_REQUESTS) {
    const oldestKey = recentRequests.keys().next().value;
    if (oldestKey) {
      recentRequests.delete(oldestKey);
    }
  }

  // Notify listeners
  for (const listener of listeners) {
    try {
      listener(enriched);
    } catch {
      // Ignore listener failures
    }
  }
}

export function onModelRequestEvent(
  listener: (evt: ModelRequestEvent) => void
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getRecentModelRequests(): ModelRequestEvent[] {
  return Array.from(recentRequests.values()).sort((a, b) => b.ts - a.ts);
}

export function clearRecentModelRequests(): void {
  recentRequests.clear();
}

export function resetModelRequestEventsForTest(): void {
  listeners.clear();
  recentRequests.clear();
  enabled = false;
}

/**
 * Helper to create a request tracker for a single model call
 */
export function createModelRequestTracker(params: {
  sessionKey?: string;
  sessionId?: string;
  channel?: string;
  provider?: string;
  model?: string;
  attempt?: number;
  maxAttempts?: number;
  requestType?: ModelRequestEvent["requestType"];
}): {
  id: string;
  start: () => void;
  success: (result: {
    usage?: ModelRequestEvent["usage"];
    context?: ModelRequestEvent["context"];
    costUsd?: number;
  }) => void;
  error: (err: {
    code?: string;
    message: string;
    httpStatus?: number;
    retryable?: boolean;
  }) => void;
} {
  const id = `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  let startedAt = 0;

  return {
    id,
    start() {
      startedAt = Date.now();
      emitModelRequestEvent({
        id,
        status: "pending",
        startedAt,
        ...params,
      });
    },
    success(result) {
      const completedAt = Date.now();
      emitModelRequestEvent({
        id,
        status: "success",
        startedAt,
        completedAt,
        durationMs: completedAt - startedAt,
        ...params,
        ...result,
      });
    },
    error(err) {
      const completedAt = Date.now();
      emitModelRequestEvent({
        id,
        status: "error",
        startedAt,
        completedAt,
        durationMs: completedAt - startedAt,
        error: err,
        ...params,
      });
    },
  };
}
