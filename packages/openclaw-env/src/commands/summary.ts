import path from "node:path";
import type { ResolvedOpenClawEnvConfig } from "../config/load.js";

function fmtMode(mode: string): string {
  return mode.toLowerCase();
}

function formatCommand(command?: string[]): string {
  if (!Array.isArray(command)) {
    return "(image default)";
  }
  if (command.length === 0) {
    return "[]";
  }
  return JSON.stringify(command);
}

export function formatPermissionSummary(cfg: ResolvedOpenClawEnvConfig): string {
  const lines: string[] = [];
  lines.push("OpenClaw Env Permissions Summary");
  lines.push("");
  lines.push(`Config: ${cfg.configPath}`);
  lines.push(`Output: ${cfg.outputDir}`);
  lines.push("");

  lines.push("OpenClaw");
  lines.push(`- image: ${cfg.openclaw.image}`);
  lines.push(`- command: ${formatCommand(cfg.openclaw.command)}`);
  lines.push("");

  lines.push("Filesystem");
  lines.push(`- workspace: ${cfg.workspace.hostPath} -> /workspace (${fmtMode(cfg.workspace.mode)})`);
  if (cfg.mounts.length > 0) {
    for (const m of cfg.mounts) {
      lines.push(`- mount: ${m.hostPath} -> ${m.container} (${fmtMode(m.mode)})`);
    }
  } else {
    lines.push("- mounts: (none)");
  }
  lines.push("");

  lines.push("Network");
  lines.push(`- mode: ${cfg.network.mode}`);
  if (cfg.network.mode === "restricted") {
    const allowlist = cfg.network.restricted.allowlist;
    if (allowlist.length > 0) {
      lines.push("- allowlist:");
      for (const entry of allowlist) {
        lines.push(`  - ${entry}`);
      }
    } else {
      lines.push("- allowlist: (empty; all egress denied)");
    }
  }
  lines.push("");

  lines.push("Secrets");
  lines.push(`- mode: ${cfg.secrets.mode}`);
  if (cfg.secrets.mode === "env_file") {
    lines.push(`- env_file: ${cfg.secrets.envFilePath}`);
  } else if (cfg.secrets.mode === "docker_secrets") {
    if (cfg.secrets.dockerSecrets.length > 0) {
      lines.push("- docker_secrets:");
      for (const s of cfg.secrets.dockerSecrets) {
        lines.push(`  - ${s.name}`);
      }
    } else {
      lines.push("- docker_secrets: (none)");
    }
  }
  lines.push("");

  lines.push("Limits");
  lines.push(`- cpus: ${cfg.limits.cpus}`);
  lines.push(`- memory: ${cfg.limits.memory}`);
  lines.push(`- pids: ${cfg.limits.pids}`);
  lines.push("");

  lines.push("Hardening defaults (openclaw)");
  lines.push(`- user: ${cfg.runtime.user}`);
  lines.push("- read_only_rootfs: true");
  lines.push("- no_new_privileges: true");
  lines.push("- cap_drop: ALL");
  lines.push("- tmpfs: /tmp, /run, /state");
  lines.push("- docker_sock: never mounted");
  if (cfg.network.mode === "off") {
    lines.push("- network: none");
  } else if (cfg.network.mode === "restricted") {
    lines.push("- network: internal-only + egress-proxy allowlist");
  } else {
    lines.push("- network: full");
  }

  lines.push("");
  lines.push("Generated files");
  lines.push(`- ${path.join(cfg.outputDir, "docker-compose.yml")}`);
  lines.push(`- ${path.join(cfg.outputDir, "openclaw.config.json5")}`);
  if (cfg.network.mode === "restricted") {
    lines.push(`- ${path.join(cfg.outputDir, "allowlist.txt")}`);
    lines.push(`- ${path.join(cfg.outputDir, "proxy")}/`);
  }

  return lines.join("\n");
}

