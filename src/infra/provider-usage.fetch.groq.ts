import type { ProviderUsageSnapshot, UsageWindow } from "./provider-usage.types.js";
import { fetchJson } from "./provider-usage.fetch.shared.js";
import { clampPercent, PROVIDER_LABELS } from "./provider-usage.shared.js";

type GroqUsageResponse = {
  object?: string;
  data?: Array<{
    api_key_id?: string;
    aggregated_at?: string;
    n_requests?: number;
    n_context_tokens_total?: number;
    n_generated_tokens_total?: number;
    n_context_tokens?: number;
    n_generated_tokens?: number;
  }>;
};

export async function fetchGroqUsage(
  apiKey: string,
  timeoutMs: number,
  fetchFn: typeof fetch,
): Promise<ProviderUsageSnapshot> {
  // Groq uses an OpenAI-compatible API with usage tracking
  // We'll attempt to fetch usage data if available
  const res = await fetchJson(
    "https://api.groq.com/openai/v1/usage",
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    },
    timeoutMs,
    fetchFn,
  );

  if (!res.ok) {
    // Groq may not expose usage via API or may have different endpoint
    // Return empty usage for now, can be enhanced later
    return {
      provider: "groq",
      displayName: PROVIDER_LABELS.groq,
      windows: [],
    };
  }

  try {
    const data = (await res.json()) as GroqUsageResponse;
    
    // If usage data is available, process it
    if (data.data && data.data.length > 0) {
      const latest = data.data[0];
      const windows: UsageWindow[] = [];
      
      // Add token usage window if available
      const contextTokens = latest.n_context_tokens_total ?? latest.n_context_tokens ?? 0;
      const generatedTokens = latest.n_generated_tokens_total ?? latest.n_generated_tokens ?? 0;
      const totalTokens = contextTokens + generatedTokens;
      
      if (totalTokens > 0) {
        // For now, we'll show a simple usage indicator
        // Groq doesn't publicly document rate limits, so we show usage activity
        windows.push({
          label: "Activity",
          usedPercent: clampPercent(0), // Placeholder for actual usage percentage
        });
      }
      
      return {
        provider: "groq",
        displayName: PROVIDER_LABELS.groq,
        windows,
      };
    }
  } catch {
    // Ignore parse errors, return empty usage
  }

  return {
    provider: "groq",
    displayName: PROVIDER_LABELS.groq,
    windows: [],
  };
}