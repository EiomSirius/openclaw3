import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveImplicitProviders } from "./models-config.providers.js";

describe("LM Studio provider", () => {
  it("should not include lmstudio when no API key is configured", async () => {
    const agentDir = mkdtempSync(join(tmpdir(), "openclaw-test-"));
    const providers = await resolveImplicitProviders({ agentDir });

    // LM Studio requires explicit configuration via LMSTUDIO_API_KEY env var or profile
    expect(providers?.lmstudio).toBeUndefined();
  });
});
