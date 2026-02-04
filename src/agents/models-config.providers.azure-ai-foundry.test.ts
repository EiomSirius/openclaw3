import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveImplicitProviders } from "./models-config.providers.js";

describe("Azure AI Foundry provider", () => {
  it("should not include azure-ai-foundry when no API key is configured", async () => {
    const agentDir = mkdtempSync(join(tmpdir(), "openclaw-test-"));
    const providers = await resolveImplicitProviders({ agentDir });

    expect(providers?.["azure-ai-foundry"]).toBeUndefined();
    expect(providers?.["azure-ai-foundry-anthropic"]).toBeUndefined();
  });
});
