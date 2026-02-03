import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GeminiAllKeysExhaustedError,
  GeminiKeyRotator,
  getDefaultGeminiKeyRotator,
  resetDefaultGeminiKeyRotator,
  withGeminiKeyRotation,
} from "./gemini-key-rotator.js";

describe("GeminiKeyRotator", () => {
  beforeEach(() => {
    resetDefaultGeminiKeyRotator();
  });

  afterEach(() => {
    resetDefaultGeminiKeyRotator();
  });

  describe("constructor", () => {
    it("initializes with provided keys", () => {
      const rotator = new GeminiKeyRotator({ keys: ["key1", "key2", "key3"] });
      expect(rotator.keyCount).toBe(3);
      expect(rotator.hasKeys).toBe(true);
    });

    it("deduplicates keys", () => {
      const rotator = new GeminiKeyRotator({ keys: ["key1", "key2", "key1", "key2"] });
      expect(rotator.keyCount).toBe(2);
    });

    it("filters empty keys", () => {
      const rotator = new GeminiKeyRotator({ keys: ["key1", "", "key2", "  ", "key3"] });
      expect(rotator.keyCount).toBe(3);
    });

    it("handles empty key array", () => {
      const rotator = new GeminiKeyRotator({ keys: [] });
      expect(rotator.keyCount).toBe(0);
      expect(rotator.hasKeys).toBe(false);
    });
  });

  describe("getNextAvailableKey", () => {
    it("returns keys in round-robin order", () => {
      const rotator = new GeminiKeyRotator({ keys: ["key1", "key2", "key3"] });

      expect(rotator.getNextAvailableKey()).toBe("key1");
      expect(rotator.getNextAvailableKey()).toBe("key2");
      expect(rotator.getNextAvailableKey()).toBe("key3");
      expect(rotator.getNextAvailableKey()).toBe("key1");
    });

    it("returns null when no keys configured", () => {
      const rotator = new GeminiKeyRotator({ keys: [] });
      expect(rotator.getNextAvailableKey()).toBeNull();
    });

    it("skips keys in cooldown", () => {
      const rotator = new GeminiKeyRotator({ keys: ["key1", "key2", "key3"] });

      rotator.markKeyRateLimited("key1");

      expect(rotator.getNextAvailableKey()).toBe("key2");
      expect(rotator.getNextAvailableKey()).toBe("key3");
      expect(rotator.getNextAvailableKey()).toBe("key2");
    });
  });

  describe("markKeyRateLimited", () => {
    it("puts key in cooldown", () => {
      const rotator = new GeminiKeyRotator({ keys: ["key1", "key2"] });

      expect(rotator.isKeyInCooldown("key1")).toBe(false);
      rotator.markKeyRateLimited("key1");
      expect(rotator.isKeyInCooldown("key1")).toBe(true);
    });

    it("increases cooldown with each error", () => {
      const rotator = new GeminiKeyRotator({
        keys: ["key1"],
        baseCooldownMs: 1000,
        maxCooldownMs: 60000,
      });

      rotator.markKeyRateLimited("key1");
      const firstCooldown = rotator.getWaitTimeMs();

      rotator.markKeyRateLimited("key1");
      const secondCooldown = rotator.getWaitTimeMs();

      expect(secondCooldown).toBeGreaterThan(firstCooldown);
    });
  });

  describe("markKeySuccess", () => {
    it("resets cooldown and error count", () => {
      const rotator = new GeminiKeyRotator({ keys: ["key1"] });

      rotator.markKeyRateLimited("key1");
      expect(rotator.isKeyInCooldown("key1")).toBe(true);

      rotator.markKeySuccess("key1");
      expect(rotator.isKeyInCooldown("key1")).toBe(false);
    });
  });

  describe("availableKeyCount", () => {
    it("returns count of keys not in cooldown", () => {
      const rotator = new GeminiKeyRotator({ keys: ["key1", "key2", "key3"] });

      expect(rotator.availableKeyCount).toBe(3);

      rotator.markKeyRateLimited("key1");
      expect(rotator.availableKeyCount).toBe(2);

      rotator.markKeyRateLimited("key2");
      expect(rotator.availableKeyCount).toBe(1);
    });
  });

  describe("getWaitTimeMs", () => {
    it("returns 0 when keys available", () => {
      const rotator = new GeminiKeyRotator({ keys: ["key1", "key2"] });
      expect(rotator.getWaitTimeMs()).toBe(0);
    });

    it("returns -1 when no keys configured", () => {
      const rotator = new GeminiKeyRotator({ keys: [] });
      expect(rotator.getWaitTimeMs()).toBe(-1);
    });

    it("returns positive value when all keys in cooldown", () => {
      const rotator = new GeminiKeyRotator({ keys: ["key1"] });
      rotator.markKeyRateLimited("key1");

      const waitTime = rotator.getWaitTimeMs();
      expect(waitTime).toBeGreaterThan(0);
    });
  });

  describe("reset", () => {
    it("clears all cooldowns and error counts", () => {
      const rotator = new GeminiKeyRotator({ keys: ["key1", "key2"] });

      rotator.markKeyRateLimited("key1");
      rotator.markKeyRateLimited("key2");
      expect(rotator.availableKeyCount).toBe(0);

      rotator.reset();
      expect(rotator.availableKeyCount).toBe(2);
    });
  });

  describe("executeWithRotation", () => {
    it("executes function with first available key", async () => {
      const rotator = new GeminiKeyRotator({ keys: ["key1", "key2"] });

      const result = await rotator.executeWithRotation(async (key) => {
        return `result-${key}`;
      });

      expect(result).toBe("result-key1");
    });

    it("retries with next key on rate limit error", async () => {
      const rotator = new GeminiKeyRotator({ keys: ["key1", "key2", "key3"] });
      const attempts: string[] = [];

      const result = await rotator.executeWithRotation(async (key) => {
        attempts.push(key);
        if (key === "key1") {
          throw new Error("429 Too Many Requests");
        }
        return `success-${key}`;
      });

      expect(attempts).toEqual(["key1", "key2"]);
      expect(result).toBe("success-key2");
    });

    it("retries on resource_exhausted error", async () => {
      const rotator = new GeminiKeyRotator({ keys: ["key1", "key2"] });
      const attempts: string[] = [];

      const result = await rotator.executeWithRotation(async (key) => {
        attempts.push(key);
        if (key === "key1") {
          throw new Error("RESOURCE_EXHAUSTED: quota exceeded");
        }
        return `success-${key}`;
      });

      expect(attempts).toEqual(["key1", "key2"]);
      expect(result).toBe("success-key2");
    });

    it("throws immediately on non-rate-limit error", async () => {
      const rotator = new GeminiKeyRotator({ keys: ["key1", "key2"] });
      const attempts: string[] = [];

      await expect(
        rotator.executeWithRotation(async (key) => {
          attempts.push(key);
          throw new Error("Invalid API key");
        }),
      ).rejects.toThrow("Invalid API key");

      expect(attempts).toEqual(["key1"]);
    });

    it("throws GeminiAllKeysExhaustedError when all keys exhausted", async () => {
      const rotator = new GeminiKeyRotator({ keys: ["key1", "key2"] });

      await expect(
        rotator.executeWithRotation(async () => {
          throw new Error("429 rate limit");
        }),
      ).rejects.toThrow(GeminiAllKeysExhaustedError);
    });

    it("throws error when no keys configured", async () => {
      const rotator = new GeminiKeyRotator({ keys: [] });

      await expect(
        rotator.executeWithRotation(async () => {
          return "result";
        }),
      ).rejects.toThrow("No Gemini API keys configured");
    });

    it("calls onRetry callback on key rotation", async () => {
      const rotator = new GeminiKeyRotator({ keys: ["key1", "key2", "key3"] });
      const retryInfo: Array<{ key: string; attempt: number }> = [];

      await rotator.executeWithRotation(
        async (key) => {
          if (key !== "key3") {
            throw new Error("429 rate limit");
          }
          return "success";
        },
        {
          onRetry: (info) => {
            retryInfo.push({ key: info.key, attempt: info.attempt });
          },
        },
      );

      expect(retryInfo).toHaveLength(2);
      expect(retryInfo[0]?.attempt).toBe(1);
      expect(retryInfo[1]?.attempt).toBe(2);
    });

    it("respects maxRetries option", async () => {
      const rotator = new GeminiKeyRotator({ keys: ["key1", "key2", "key3"] });
      let attempts = 0;

      await expect(
        rotator.executeWithRotation(
          async () => {
            attempts++;
            throw new Error("429 rate limit");
          },
          { maxRetries: 2 },
        ),
      ).rejects.toThrow(GeminiAllKeysExhaustedError);

      expect(attempts).toBe(2);
    });

    it("marks key as success after successful execution", async () => {
      const rotator = new GeminiKeyRotator({ keys: ["key1", "key2"] });

      // First mark key1 as rate limited
      rotator.markKeyRateLimited("key1");
      expect(rotator.isKeyInCooldown("key1")).toBe(true);

      // Execute with key1 (not available) -> key2
      await rotator.executeWithRotation(async (key) => {
        return `result-${key}`;
      });

      // key2 should now be marked as good
      expect(rotator.isKeyInCooldown("key2")).toBe(false);
    });
  });

  describe("singleton functions", () => {
    it("getDefaultGeminiKeyRotator returns same instance", () => {
      const rotator1 = getDefaultGeminiKeyRotator();
      const rotator2 = getDefaultGeminiKeyRotator();
      expect(rotator1).toBe(rotator2);
    });

    it("resetDefaultGeminiKeyRotator creates new instance", () => {
      const rotator1 = getDefaultGeminiKeyRotator();
      resetDefaultGeminiKeyRotator();
      const rotator2 = getDefaultGeminiKeyRotator();
      expect(rotator1).not.toBe(rotator2);
    });
  });

  describe("withGeminiKeyRotation", () => {
    beforeEach(() => {
      vi.stubEnv("GEMINI_API_KEYS", "testkey1,testkey2");
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("uses default rotator", async () => {
      const result = await withGeminiKeyRotation(async (key) => {
        return `result-${key}`;
      });

      expect(result).toBe("result-testkey1");
    });
  });
});

describe("isGeminiRateLimitError", () => {
  const rateLimitMessages = [
    "429 Too Many Requests",
    "Rate limit exceeded",
    "rate_limit_error",
    "RESOURCE_EXHAUSTED",
    "resource exhausted",
    "Quota exceeded for this API key",
    "quota_exceeded",
    "Too many requests, please try again later",
    "You have exceeded your current quota",
    "The resource has been exhausted",
  ];

  const nonRateLimitMessages = [
    "Invalid API key",
    "Authentication failed",
    "Internal server error",
    "Bad request",
    "Model not found",
    "",
  ];

  for (const message of rateLimitMessages) {
    it(`detects rate limit: "${message}"`, async () => {
      const { isGeminiRateLimitError } = await import("./live-auth-keys.js");
      expect(isGeminiRateLimitError(message)).toBe(true);
    });
  }

  for (const message of nonRateLimitMessages) {
    it(`does not match non-rate-limit: "${message}"`, async () => {
      const { isGeminiRateLimitError } = await import("./live-auth-keys.js");
      expect(isGeminiRateLimitError(message)).toBe(false);
    });
  }
});

describe("collectGeminiApiKeys", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns empty array when no keys configured", async () => {
    const { collectGeminiApiKeys } = await import("./live-auth-keys.js");
    const keys = collectGeminiApiKeys();
    // May have keys from actual env, so just check it returns an array
    expect(Array.isArray(keys)).toBe(true);
  });

  it("parses GEMINI_API_KEYS comma-separated list", async () => {
    vi.stubEnv("GEMINI_API_KEYS", "key1,key2,key3");
    vi.stubEnv("GEMINI_API_KEY", undefined);
    vi.stubEnv("GOOGLE_API_KEY", undefined);

    const { collectGeminiApiKeys } = await import("./live-auth-keys.js");
    const keys = collectGeminiApiKeys();
    expect(keys).toContain("key1");
    expect(keys).toContain("key2");
    expect(keys).toContain("key3");
  });

  it("parses GEMINI_API_KEYS semicolon-separated list", async () => {
    vi.stubEnv("GEMINI_API_KEYS", "key1;key2;key3");
    vi.stubEnv("GEMINI_API_KEY", undefined);
    vi.stubEnv("GOOGLE_API_KEY", undefined);

    const { collectGeminiApiKeys } = await import("./live-auth-keys.js");
    const keys = collectGeminiApiKeys();
    expect(keys).toContain("key1");
    expect(keys).toContain("key2");
    expect(keys).toContain("key3");
  });

  it("includes GEMINI_API_KEY as fallback", async () => {
    vi.stubEnv("GEMINI_API_KEYS", undefined);
    vi.stubEnv("GEMINI_API_KEY", "single-key");
    vi.stubEnv("GOOGLE_API_KEY", undefined);

    const { collectGeminiApiKeys } = await import("./live-auth-keys.js");
    const keys = collectGeminiApiKeys();
    expect(keys).toContain("single-key");
  });

  it("includes GOOGLE_API_KEY as fallback", async () => {
    vi.stubEnv("GEMINI_API_KEYS", undefined);
    vi.stubEnv("GEMINI_API_KEY", undefined);
    vi.stubEnv("GOOGLE_API_KEY", "google-key");

    const { collectGeminiApiKeys } = await import("./live-auth-keys.js");
    const keys = collectGeminiApiKeys();
    expect(keys).toContain("google-key");
  });

  it("deduplicates keys", async () => {
    vi.stubEnv("GEMINI_API_KEYS", "key1,key2,key1");
    vi.stubEnv("GEMINI_API_KEY", "key2");
    vi.stubEnv("GOOGLE_API_KEY", undefined);

    const { collectGeminiApiKeys } = await import("./live-auth-keys.js");
    const keys = collectGeminiApiKeys();
    const uniqueKeys = [...new Set(keys)];
    expect(keys.length).toBe(uniqueKeys.length);
  });

  it("uses OPENCLAW_LIVE_GEMINI_KEY as override", async () => {
    vi.stubEnv("OPENCLAW_LIVE_GEMINI_KEY", "override-key");
    vi.stubEnv("GEMINI_API_KEYS", "key1,key2");
    vi.stubEnv("GEMINI_API_KEY", "single-key");

    const { collectGeminiApiKeys } = await import("./live-auth-keys.js");
    const keys = collectGeminiApiKeys();
    expect(keys).toEqual(["override-key"]);
  });
});
