import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";

type ProfileId = "safe" | "dev" | "integrations";

export type InitCommandOptions = {
  cwd: string;
  profile?: string;
  force: boolean;
};

type DraftConfig = {
  schema_version: "openclaw_env.v1";
  openclaw: { image: string; command?: string[]; env: Record<string, string> };
  workspace: { path: string; mode: "ro" | "rw" };
  mounts: Array<{ host: string; container: string; mode: "ro" | "rw" }>;
  network: { mode: "off" | "full" | "restricted"; restricted: { allowlist: string[] } };
  secrets: {
    mode: "none" | "env_file" | "docker_secrets";
    env_file: string;
    docker_secrets: Array<{ name: string; file: string }>;
  };
  limits: { cpus: number; memory: string; pids: number };
  runtime: { user: string };
};

function parseProfile(input?: string): ProfileId | null {
  const raw = (input ?? "").trim().toLowerCase();
  if (!raw) return null;
  if (raw === "safe" || raw === "dev" || raw === "integrations") return raw;
  return null;
}

function defaultAllowlistForProfile(profile: ProfileId): string[] {
  if (profile === "safe") {
    return [];
  }
  // Keep this small but practical for common dev workflows.
  return [
    "api.openai.com",
    "api.anthropic.com",
    "github.com",
    "raw.githubusercontent.com",
    "objects.githubusercontent.com",
    "registry.npmjs.org",
    "pypi.org",
    "files.pythonhosted.org",
  ];
}

function defaultDraft(profile: ProfileId): DraftConfig {
  const workspaceMode: "ro" | "rw" = profile === "safe" ? "ro" : "rw";
  const networkMode: "off" | "full" | "restricted" =
    profile === "safe" ? "off" : "restricted";
  const secretsMode: "none" | "env_file" | "docker_secrets" =
    profile === "integrations" ? "env_file" : "none";

  return {
    schema_version: "openclaw_env.v1",
    openclaw: {
      image: "openclaw:local",
      env: {
        OPENCLAW_LOG_LEVEL: "info",
      },
    },
    workspace: {
      path: ".",
      mode: workspaceMode,
    },
    mounts: [],
    network: {
      mode: networkMode,
      restricted: {
        allowlist: defaultAllowlistForProfile(profile),
      },
    },
    secrets: {
      mode: secretsMode,
      env_file: ".env.openclaw",
      docker_secrets: [],
    },
    limits: {
      cpus: 2,
      memory: "4g",
      pids: 256,
    },
    runtime: {
      user: "1000:1000",
    },
  };
}

function parseCsvList(input: string): string[] {
  return input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseNumberLike(input: string, fallback: number): number {
  const n = Number.parseFloat(String(input).trim());
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function confirmOverwrite(configPath: string): Promise<boolean> {
  const { default: inquirer } = await import("inquirer");
  const answer = await inquirer.prompt([
    {
      type: "confirm",
      name: "overwrite",
      message: `File exists: ${configPath}\nOverwrite?`,
      default: false,
    },
  ]);
  return Boolean((answer as { overwrite?: unknown }).overwrite);
}

export async function initCommand(opts: InitCommandOptions): Promise<void> {
  const configPath = path.resolve(opts.cwd, "openclaw.env.yml");
  const outputDir = path.resolve(opts.cwd, ".openclaw-env");

  const existing = await fs
    .access(configPath)
    .then(() => true)
    .catch(() => false);
  if (existing && !opts.force) {
    const ok = await confirmOverwrite(configPath);
    if (!ok) {
      process.stdout.write("Aborted.\n");
      return;
    }
  }

  const chosenProfile = parseProfile(opts.profile);
  const { default: inquirer } = await import("inquirer");

  const baseProfile: ProfileId =
    chosenProfile ??
    ((
      await inquirer.prompt([
        {
          type: "list",
          name: "profile",
          message: "Choose a preset profile",
          choices: [
            { name: "safe (workspace ro, network off, secrets none)", value: "safe" },
            { name: "dev (workspace rw, network restricted, secrets none)", value: "dev" },
            {
              name: "integrations (workspace rw, restricted, secrets env_file)",
              value: "integrations",
            },
          ],
          default: "safe",
        },
      ])
    ) as { profile: ProfileId }).profile;

  const draft = defaultDraft(baseProfile);

  const answers = (await inquirer.prompt([
    {
      type: "input",
      name: "image",
      message: "OpenClaw image",
      default: draft.openclaw.image,
    },
    {
      type: "list",
      name: "workspaceMode",
      message: "Workspace access",
      choices: [
        { name: "read-only (ro)", value: "ro" },
        { name: "read-write (rw)", value: "rw" },
      ],
      default: draft.workspace.mode,
    },
    {
      type: "list",
      name: "networkMode",
      message: "Network mode",
      choices: [
        { name: "off (no network)", value: "off" },
        { name: "restricted (egress proxy allowlist)", value: "restricted" },
        { name: "full (unrestricted)", value: "full" },
      ],
      default: draft.network.mode,
    },
    {
      type: "input",
      name: "allowlist",
      message: "Restricted allowlist domains (comma-separated)",
      when: (a: { networkMode?: string }) => a.networkMode === "restricted",
      default: draft.network.restricted.allowlist.join(", "),
    },
    {
      type: "list",
      name: "secretsMode",
      message: "Secrets mode",
      choices: [
        { name: "none", value: "none" },
        { name: "env_file (path only)", value: "env_file" },
        { name: "docker_secrets (names + files)", value: "docker_secrets" },
      ],
      default: draft.secrets.mode,
    },
    {
      type: "input",
      name: "envFile",
      message: "Env file path (relative to repo)",
      when: (a: { secretsMode?: string }) => a.secretsMode === "env_file",
      default: draft.secrets.env_file,
    },
    {
      type: "input",
      name: "cpus",
      message: "CPU limit (e.g. 2)",
      default: String(draft.limits.cpus),
    },
    {
      type: "input",
      name: "memory",
      message: "Memory limit (e.g. 4g)",
      default: draft.limits.memory,
    },
    {
      type: "input",
      name: "pids",
      message: "PIDs limit (e.g. 256)",
      default: String(draft.limits.pids),
    },
    {
      type: "input",
      name: "user",
      message: "Container user (uid:gid)",
      default: draft.runtime.user,
    },
  ])) as {
    image: string;
    workspaceMode: "ro" | "rw";
    networkMode: "off" | "full" | "restricted";
    allowlist?: string;
    secretsMode: "none" | "env_file" | "docker_secrets";
    envFile?: string;
    cpus: string;
    memory: string;
    pids: string;
    user: string;
  };

  const mounts: DraftConfig["mounts"] = [];
  while (true) {
    const { addMount } = (await inquirer.prompt([
      { type: "confirm", name: "addMount", message: "Add an extra mount?", default: false },
    ])) as { addMount: boolean };
    if (!addMount) break;
    const m = (await inquirer.prompt([
      { type: "input", name: "host", message: "Host path (relative to repo ok)" },
      { type: "input", name: "container", message: "Container path (e.g. /data)" },
      {
        type: "list",
        name: "mode",
        message: "Mount mode",
        choices: [
          { name: "read-only (ro)", value: "ro" },
          { name: "read-write (rw)", value: "rw" },
        ],
        default: "ro",
      },
    ])) as { host: string; container: string; mode: "ro" | "rw" };
    if (m.host.trim() && m.container.trim()) {
      mounts.push({ host: m.host.trim(), container: m.container.trim(), mode: m.mode });
    }
  }

  const dockerSecrets: DraftConfig["secrets"]["docker_secrets"] = [];
  if (answers.secretsMode === "docker_secrets") {
    while (true) {
      const { addSecret } = (await inquirer.prompt([
        { type: "confirm", name: "addSecret", message: "Add a docker secret?", default: false },
      ])) as { addSecret: boolean };
      if (!addSecret) break;
      const s = (await inquirer.prompt([
        { type: "input", name: "name", message: "Secret name (used as /run/secrets/<name>)" },
        { type: "input", name: "file", message: "Secret file path (relative to repo ok)" },
      ])) as { name: string; file: string };
      if (s.name.trim() && s.file.trim()) {
        dockerSecrets.push({ name: s.name.trim(), file: s.file.trim() });
      }
    }
  }

  const config: DraftConfig = {
    ...draft,
    openclaw: {
      ...draft.openclaw,
      image: answers.image.trim() || draft.openclaw.image,
    },
    workspace: {
      ...draft.workspace,
      mode: answers.workspaceMode,
    },
    mounts,
    network: {
      mode: answers.networkMode,
      restricted: {
        allowlist:
          answers.networkMode === "restricted"
            ? parseCsvList(answers.allowlist ?? "")
            : [],
      },
    },
    secrets: {
      mode: answers.secretsMode,
      env_file: answers.envFile?.trim() || draft.secrets.env_file,
      docker_secrets: dockerSecrets,
    },
    limits: {
      cpus: parseNumberLike(answers.cpus, draft.limits.cpus),
      memory: answers.memory.trim() || draft.limits.memory,
      pids: Math.trunc(parseNumberLike(answers.pids, draft.limits.pids)),
    },
    runtime: {
      user: answers.user.trim() || draft.runtime.user,
    },
  };

  const yaml = YAML.stringify(config, { lineWidth: 0 });
  await fs.writeFile(configPath, yaml, "utf-8");
  await fs.mkdir(outputDir, { recursive: true });

  process.stdout.write(`Wrote ${configPath}\n`);
  process.stdout.write(`Created ${outputDir}/\n`);
  process.stdout.write("Next:\n");
  process.stdout.write("  openclaw-env print\n");
  process.stdout.write("  openclaw-env up\n");
}

