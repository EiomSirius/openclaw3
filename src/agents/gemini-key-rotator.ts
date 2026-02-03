/**
 * Gemini API Key Rotator
 *
 * Provides key rotation with per-key cooldown tracking for handling 429 rate limit errors.
 * Implements exponential backoff cooldowns per key (1min → 5min → 25min → 60min max).
 */

import { collectGeminiApiKeys, isGeminiRateLimitError } from "./live-auth-keys.js";

export type GeminiKeyState = {
  key: string;
  errorCount: number;
  cooldownUntil: number;
  lastUsed: number;
};

export type GeminiKeyRotatorOptions = {
  /** Keys to use. If not provided, keys are loaded from environment. */
  keys?: string[];
  /** Maximum cooldown duration in ms. Default: 60 minutes. */
  maxCooldownMs?: number;
  /** Base cooldown duration in ms. Default: 60 seconds. */
  baseCooldownMs?: number;
};

const DEFAULT_BASE_COOLDOWN_MS = 60_000; // 1 minute
const DEFAULT_MAX_COOLDOWN_MS = 60 * 60_000; // 60 minutes

/**
 * Calculate exponential backoff cooldown: 1min → 5min → 25min → 60min max
 */
function calculateCooldownMs(
  errorCount: number,
  baseCooldownMs: number,
  maxCooldownMs: number,
): number {
  const normalized = Math.max(1, errorCount);
  const exponent = Math.min(normalized - 1, 3);
  const raw = baseCooldownMs * 5 ** exponent;
  return Math.min(maxCooldownMs, raw);
}

/**
 * Manages multiple Gemini API keys with automatic rotation on rate limit errors.
 *
 * Usage:
 * ```ts
 * const rotator = new GeminiKeyRotator();
 * const result = await rotator.executeWithRotation(async (apiKey) => {
 *   return fetch(url, { headers: { 'x-goog-api-key': apiKey } });
 * });
 * ```
 */
export class GeminiKeyRotator {
  private keyStates: Map<string, GeminiKeyState> = new Map();
  private keyOrder: string[] = [];
  private currentIndex = 0;
  private baseCooldownMs: number;
  private maxCooldownMs: number;

  constructor(options: GeminiKeyRotatorOptions = {}) {
    this.baseCooldownMs = options.baseCooldownMs ?? DEFAULT_BASE_COOLDOWN_MS;
    this.maxCooldownMs = options.maxCooldownMs ?? DEFAULT_MAX_COOLDOWN_MS;

    const keys = options.keys ?? collectGeminiApiKeys();
    this.initializeKeys(keys);
  }

  private initializeKeys(keys: string[]): void {
    const uniqueKeys = [...new Set(keys.map((k) => k.trim()).filter(Boolean))];
    this.keyOrder = uniqueKeys;
    for (const key of uniqueKeys) {
      this.keyStates.set(key, {
        key,
        errorCount: 0,
        cooldownUntil: 0,
        lastUsed: 0,
      });
    }
  }

  /**
   * Get the number of configured keys.
   */
  get keyCount(): number {
    return this.keyOrder.length;
  }

  /**
   * Check if any keys are configured.
   */
  get hasKeys(): boolean {
    return this.keyOrder.length > 0;
  }

  /**
   * Get the number of keys currently available (not in cooldown).
   */
  get availableKeyCount(): number {
    const now = Date.now();
    return this.keyOrder.filter((key) => {
      const state = this.keyStates.get(key);
      return state && state.cooldownUntil <= now;
    }).length;
  }

  /**
   * Check if a specific key is currently in cooldown.
   */
  isKeyInCooldown(key: string): boolean {
    const state = this.keyStates.get(key);
    if (!state) {
      return false;
    }
    return Date.now() < state.cooldownUntil;
  }

  /**
   * Get the next available API key, skipping keys in cooldown.
   * Returns null if all keys are exhausted (in cooldown).
   */
  getNextAvailableKey(): string | null {
    if (this.keyOrder.length === 0) {
      return null;
    }

    const now = Date.now();
    const startIndex = this.currentIndex;

    // Try to find an available key using round-robin
    for (let i = 0; i < this.keyOrder.length; i++) {
      const index = (startIndex + i) % this.keyOrder.length;
      const key = this.keyOrder[index];
      const state = this.keyStates.get(key);

      if (state && state.cooldownUntil <= now) {
        this.currentIndex = (index + 1) % this.keyOrder.length;
        return key;
      }
    }

    // All keys are in cooldown - find the one that expires soonest
    let soonestKey: string | null = null;
    let soonestExpiry = Number.POSITIVE_INFINITY;

    for (const key of this.keyOrder) {
      const state = this.keyStates.get(key);
      if (state && state.cooldownUntil < soonestExpiry) {
        soonestExpiry = state.cooldownUntil;
        soonestKey = key;
      }
    }

    return soonestKey;
  }

  /**
   * Get the first available API key without advancing the rotation index.
   * Returns null if no keys are configured.
   */
  peekNextKey(): string | null {
    if (this.keyOrder.length === 0) {
      return null;
    }

    const now = Date.now();

    // Find first available key
    for (let i = 0; i < this.keyOrder.length; i++) {
      const index = (this.currentIndex + i) % this.keyOrder.length;
      const key = this.keyOrder[index];
      const state = this.keyStates.get(key);

      if (state && state.cooldownUntil <= now) {
        return key;
      }
    }

    // All in cooldown, return the soonest
    return this.keyOrder[this.currentIndex] ?? null;
  }

  /**
   * Mark a key as rate-limited. Increments error count and sets cooldown.
   */
  markKeyRateLimited(key: string): void {
    const state = this.keyStates.get(key);
    if (!state) {
      return;
    }

    state.errorCount += 1;
    state.cooldownUntil =
      Date.now() + calculateCooldownMs(state.errorCount, this.baseCooldownMs, this.maxCooldownMs);
  }

  /**
   * Mark a key as successfully used. Resets error count and cooldown.
   */
  markKeySuccess(key: string): void {
    const state = this.keyStates.get(key);
    if (!state) {
      return;
    }

    state.errorCount = 0;
    state.cooldownUntil = 0;
    state.lastUsed = Date.now();
  }

  /**
   * Reset all key states (clear cooldowns and error counts).
   */
  reset(): void {
    for (const state of this.keyStates.values()) {
      state.errorCount = 0;
      state.cooldownUntil = 0;
    }
    this.currentIndex = 0;
  }

  /**
   * Get the wait time in ms until the next key becomes available.
   * Returns 0 if a key is available now, or -1 if no keys are configured.
   */
  getWaitTimeMs(): number {
    if (this.keyOrder.length === 0) {
      return -1;
    }

    const now = Date.now();
    let minWait = Number.POSITIVE_INFINITY;

    for (const key of this.keyOrder) {
      const state = this.keyStates.get(key);
      if (!state) {
        continue;
      }

      const wait = state.cooldownUntil - now;
      if (wait <= 0) {
        return 0; // Key available now
      }
      if (wait < minWait) {
        minWait = wait;
      }
    }

    return minWait === Number.POSITIVE_INFINITY ? -1 : minWait;
  }

  /**
   * Execute an async function with automatic key rotation on rate limit errors.
   *
   * @param fn - Function to execute that receives the API key
   * @param options - Execution options
   * @returns The result of the function
   * @throws Error if all keys are exhausted or fn throws a non-rate-limit error
   */
  async executeWithRotation<T>(
    fn: (apiKey: string) => Promise<T>,
    options: {
      /** Maximum number of retries across all keys. Default: keyCount * 2 */
      maxRetries?: number;
      /** Whether to wait for cooldown when all keys are exhausted. Default: false */
      waitForCooldown?: boolean;
      /** Maximum time to wait for cooldown in ms. Default: 5 minutes */
      maxWaitMs?: number;
      /** Callback when retrying with a new key */
      onRetry?: (info: { key: string; attempt: number; error: unknown }) => void;
    } = {},
  ): Promise<T> {
    if (!this.hasKeys) {
      throw new Error(
        "No Gemini API keys configured. Set GEMINI_API_KEY or GEMINI_API_KEYS environment variable.",
      );
    }

    const maxRetries = options.maxRetries ?? this.keyCount * 2;
    const waitForCooldown = options.waitForCooldown ?? false;
    const maxWaitMs = options.maxWaitMs ?? 5 * 60_000;

    let lastError: unknown;
    let attempt = 0;

    while (attempt < maxRetries) {
      const key = this.getNextAvailableKey();

      if (!key) {
        // All keys exhausted
        if (waitForCooldown) {
          const waitTime = this.getWaitTimeMs();
          if (waitTime > 0 && waitTime <= maxWaitMs) {
            await sleep(waitTime);
            continue;
          }
        }
        throw new GeminiAllKeysExhaustedError(
          `All ${this.keyCount} Gemini API keys are rate-limited. ` +
            `Wait ${Math.ceil(this.getWaitTimeMs() / 1000)}s for cooldown.`,
          lastError,
        );
      }

      attempt += 1;

      try {
        const result = await fn(key);
        this.markKeySuccess(key);
        return result;
      } catch (err) {
        lastError = err;

        const errorMessage = err instanceof Error ? err.message : String(err);

        if (isGeminiRateLimitError(errorMessage)) {
          this.markKeyRateLimited(key);
          options.onRetry?.({ key: maskApiKey(key), attempt, error: err });
          continue;
        }

        // Non-rate-limit error, don't retry with different key
        throw err;
      }
    }

    throw new GeminiAllKeysExhaustedError(
      `Failed after ${attempt} attempts across ${this.keyCount} Gemini API keys.`,
      lastError,
    );
  }
}

/**
 * Error thrown when all Gemini API keys have been exhausted due to rate limiting.
 */
export class GeminiAllKeysExhaustedError extends Error {
  public readonly cause: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "GeminiAllKeysExhaustedError";
    this.cause = cause;
  }
}

/**
 * Mask an API key for logging purposes (shows first 4 and last 4 characters).
 */
function maskApiKey(key: string): string {
  if (key.length <= 12) {
    return "****";
  }
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Module-level singleton for shared state across the application
let defaultRotator: GeminiKeyRotator | null = null;

/**
 * Get or create the default Gemini key rotator singleton.
 * Use this for shared key rotation state across the application.
 */
export function getDefaultGeminiKeyRotator(): GeminiKeyRotator {
  if (!defaultRotator) {
    defaultRotator = new GeminiKeyRotator();
  }
  return defaultRotator;
}

/**
 * Reset the default rotator (useful for testing or reloading keys).
 */
export function resetDefaultGeminiKeyRotator(): void {
  defaultRotator = null;
}

/**
 * Convenience wrapper to execute a function with Gemini key rotation.
 * Uses the default singleton rotator.
 *
 * @example
 * ```ts
 * const response = await withGeminiKeyRotation(async (apiKey) => {
 *   return fetch(url, { headers: { 'x-goog-api-key': apiKey } });
 * });
 * ```
 */
export async function withGeminiKeyRotation<T>(
  fn: (apiKey: string) => Promise<T>,
  options?: Parameters<GeminiKeyRotator["executeWithRotation"]>[1],
): Promise<T> {
  const rotator = getDefaultGeminiKeyRotator();
  return rotator.executeWithRotation(fn, options);
}
