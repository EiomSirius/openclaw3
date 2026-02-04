import { describe, expect, it } from "vitest";
import { OpenClawEnvConfigSchema } from "./schema.js";

describe("OpenClawEnvConfigSchema", () => {
  it("applies defaults for minimal config", () => {
    const cfg = OpenClawEnvConfigSchema.parse({ schema_version: "openclaw_env.v1" });
    expect(cfg.openclaw.image).toBe("openclaw:local");
    expect(cfg.workspace.mode).toBe("ro");
    expect(cfg.network.mode).toBe("off");
    expect(cfg.secrets.mode).toBe("none");
    expect(cfg.limits.cpus).toBe(2);
    expect(cfg.limits.memory).toBe("4g");
    expect(cfg.limits.pids).toBe(256);
    expect(cfg.runtime.user).toBe("1000:1000");
  });

  it("rejects invalid network mode", () => {
    expect(() =>
      OpenClawEnvConfigSchema.parse({
        schema_version: "openclaw_env.v1",
        network: { mode: "wat" },
      }),
    ).toThrow();
  });
});

