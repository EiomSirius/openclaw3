import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ResolvedOpenClawEnvConfig } from "../config/load.js";
import { generateCompose } from "./compose.js";

function baseResolvedConfig(overrides?: Partial<ResolvedOpenClawEnvConfig>): ResolvedOpenClawEnvConfig {
  const configDir = path.join(os.tmpdir(), "openclaw-env-test");
  const outputDir = path.join(configDir, ".openclaw-env");
  return {
    schema_version: "openclaw_env.v1",
    configPath: path.join(configDir, "openclaw.env.yml"),
    configDir,
    outputDir,
    projectName: "openclaw-env-test-12345678",
    openclaw: {
      image: "openclaw/openclaw:latest",
      env: {},
    },
    workspace: {
      hostPath: configDir,
      mode: "ro",
    },
    mounts: [],
    network: {
      mode: "off",
      restricted: { allowlist: [] },
    },
    secrets: {
      mode: "none",
      envFilePath: path.join(configDir, ".env.openclaw"),
      dockerSecrets: [],
    },
    limits: {
      cpus: 2,
      memory: "4g",
      pids: 256,
    },
    runtime: {
      user: "1000:1000",
    },
    generated: {
      composePath: path.join(outputDir, "docker-compose.yml"),
      openclawConfigPath: path.join(outputDir, "openclaw.config.json5"),
      allowlistPath: path.join(outputDir, "allowlist.txt"),
      proxyDir: path.join(outputDir, "proxy"),
      proxyServerPath: path.join(outputDir, "proxy", "server.mjs"),
      proxyDockerfilePath: path.join(outputDir, "proxy", "Dockerfile"),
    },
    ...overrides,
  };
}

describe("generateCompose", () => {
  it("includes hardening defaults on openclaw service", () => {
    const cfg = baseResolvedConfig();
    const out = generateCompose(cfg);
    const compose = out.composeObject as any;

    const svc = compose.services.openclaw;
    expect(svc.read_only).toBe(true);
    expect(svc.cap_drop).toEqual(["ALL"]);
    expect(svc.security_opt).toEqual(["no-new-privileges:true"]);
    expect(svc.tmpfs).toEqual(["/tmp", "/run", "/state"]);
    expect(svc.working_dir).toBe("/workspace");
    expect(svc.user).toBe("1000:1000");
  });

  it("wires restricted networking correctly", () => {
    const cfg = baseResolvedConfig({
      network: { mode: "restricted", restricted: { allowlist: ["api.openai.com"] } },
      workspace: { hostPath: "/tmp/work", mode: "ro" },
    });
    const out = generateCompose(cfg);
    const compose = out.composeObject as any;

    expect(compose.networks.openclaw_internal.internal).toBe(true);
    expect(compose.services.openclaw.networks).toEqual(["openclaw_internal"]);
    expect(compose.services["egress-proxy"].networks).toEqual(["openclaw_internal", "openclaw_egress"]);

    const env = compose.services.openclaw.environment;
    expect(env.HTTP_PROXY).toBe("http://egress-proxy:3128");
    expect(env.HTTPS_PROXY).toBe("http://egress-proxy:3128");
    expect(env.NO_PROXY).toContain("egress-proxy");
  });
});

