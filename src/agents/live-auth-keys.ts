const KEY_SPLIT_RE = /[\s,;]+/g;

function parseKeyList(raw?: string | null): string[] {
  if (!raw) {
    return [];
  }
  return raw
    .split(KEY_SPLIT_RE)
    .map((value) => value.trim())
    .filter(Boolean);
}

function collectEnvPrefixedKeys(prefix: string): string[] {
  const keys: string[] = [];
  for (const [name, value] of Object.entries(process.env)) {
    if (!name.startsWith(prefix)) {
      continue;
    }
    const trimmed = value?.trim();
    if (!trimmed) {
      continue;
    }
    keys.push(trimmed);
  }
  return keys;
}

export function collectAnthropicApiKeys(): string[] {
  const forcedSingle = process.env.OPENCLAW_LIVE_ANTHROPIC_KEY?.trim();
  if (forcedSingle) {
    return [forcedSingle];
  }

  const fromList = parseKeyList(process.env.OPENCLAW_LIVE_ANTHROPIC_KEYS);
  const fromEnv = collectEnvPrefixedKeys("ANTHROPIC_API_KEY");
  const primary = process.env.ANTHROPIC_API_KEY?.trim();

  const seen = new Set<string>();
  const add = (value?: string) => {
    if (!value) {
      return;
    }
    if (seen.has(value)) {
      return;
    }
    seen.add(value);
  };

  for (const value of fromList) {
    add(value);
  }
  if (primary) {
    add(primary);
  }
  for (const value of fromEnv) {
    add(value);
  }

  return Array.from(seen);
}

export function isAnthropicRateLimitError(message: string): boolean {
  const lower = message.toLowerCase();
  if (lower.includes("rate_limit")) {
    return true;
  }
  if (lower.includes("rate limit")) {
    return true;
  }
  if (lower.includes("429")) {
    return true;
  }
  return false;
}

export function isAnthropicBillingError(message: string): boolean {
  const lower = message.toLowerCase();
  if (lower.includes("credit balance")) {
    return true;
  }
  if (lower.includes("insufficient credit")) {
    return true;
  }
  if (lower.includes("insufficient credits")) {
    return true;
  }
  if (lower.includes("payment required")) {
    return true;
  }
  if (lower.includes("billing") && lower.includes("disabled")) {
    return true;
  }
  if (lower.includes("402")) {
    return true;
  }
  return false;
}

/**
 * Collect all configured Gemini API keys from environment variables.
 *
 * Priority order:
 * 1. OPENCLAW_LIVE_GEMINI_KEY (single key override)
 * 2. GEMINI_API_KEYS (comma/semicolon/space-separated list)
 * 3. GEMINI_API_KEY (single legacy key)
 * 4. GEMINI_API_KEY_* (prefixed keys e.g. GEMINI_API_KEY_1, GEMINI_API_KEY_2)
 * 5. GOOGLE_API_KEY (fallback single key)
 *
 * Keys are deduplicated.
 */
export function collectGeminiApiKeys(): string[] {
  const forcedSingle = process.env.OPENCLAW_LIVE_GEMINI_KEY?.trim();
  if (forcedSingle) {
    return [forcedSingle];
  }

  const fromList = parseKeyList(process.env.GEMINI_API_KEYS);
  const fromEnv = collectEnvPrefixedKeys("GEMINI_API_KEY_");
  const primary = process.env.GEMINI_API_KEY?.trim();
  const googleFallback = process.env.GOOGLE_API_KEY?.trim();

  const seen = new Set<string>();
  const add = (value?: string) => {
    if (!value) {
      return;
    }
    if (seen.has(value)) {
      return;
    }
    seen.add(value);
  };

  for (const value of fromList) {
    add(value);
  }
  if (primary) {
    add(primary);
  }
  for (const value of fromEnv) {
    add(value);
  }
  if (googleFallback) {
    add(googleFallback);
  }

  return Array.from(seen);
}

/**
 * Check if an error message indicates a Gemini rate limit or quota exhaustion.
 */
export function isGeminiRateLimitError(message: string): boolean {
  const lower = message.toLowerCase();
  if (lower.includes("429")) {
    return true;
  }
  if (lower.includes("rate_limit") || lower.includes("rate limit")) {
    return true;
  }
  if (lower.includes("resource_exhausted") || lower.includes("resource exhausted")) {
    return true;
  }
  if (lower.includes("quota exceeded") || lower.includes("quota_exceeded")) {
    return true;
  }
  if (lower.includes("too many requests")) {
    return true;
  }
  if (lower.includes("exceeded your current quota")) {
    return true;
  }
  if (lower.includes("resource has been exhausted")) {
    return true;
  }
  return false;
}
