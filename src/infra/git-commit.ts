import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const formatCommit = (value?: string | null) => {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.length > 7 ? trimmed.slice(0, 7) : trimmed;
};

const resolveGitHead = (startDir: string) => {
  let current = startDir;
  for (let i = 0; i < 12; i += 1) {
    const gitPath = path.join(current, ".git");
    try {
      const stat = fs.statSync(gitPath);
      if (stat.isDirectory()) {
        return path.join(gitPath, "HEAD");
      }
      if (stat.isFile()) {
        const raw = fs.readFileSync(gitPath, "utf-8");
        const match = raw.match(/gitdir:\s*(.+)/i);
        if (match?.[1]) {
          const resolved = path.resolve(current, match[1].trim());
          return path.join(resolved, "HEAD");
        }
      }
    } catch {
      // ignore missing .git at this level
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return null;
};

let cachedCommit: string | null | undefined;

const readCommitFromPackageJson = (fromDir?: string) => {
  try {
    if (fromDir) {
      const pkgPath = path.join(fromDir, "package.json");
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as {
        gitHead?: string;
        githead?: string;
      };
      return formatCommit(pkg.gitHead ?? pkg.githead ?? null);
    }
    const require = createRequire(import.meta.url);
    const pkg = require("../../package.json") as { gitHead?: string; githead?: string };
    return formatCommit(pkg.gitHead ?? pkg.githead ?? null);
  } catch {
    return null;
  }
};

const readCommitFromBuildInfo = (fromDir?: string) => {
  try {
    if (fromDir) {
      const infoPath = path.join(fromDir, "build-info.json");
      const info = JSON.parse(fs.readFileSync(infoPath, "utf-8")) as { commit?: string | null };
      return formatCommit(info.commit ?? null);
    }
    const require = createRequire(import.meta.url);
    const info = require("../build-info.json") as { commit?: string | null };
    return formatCommit(info.commit ?? null);
  } catch {
    return null;
  }
};

/** Resolve commit from a specific directory (git HEAD or package/build-info). Does not use global cache. */
function resolveCommitForDir(cwd: string): string | null {
  const buildInfoCommit = readCommitFromBuildInfo(cwd);
  if (buildInfoCommit) return buildInfoCommit;
  const pkgCommit = readCommitFromPackageJson(cwd);
  if (pkgCommit) return pkgCommit;
  try {
    const headPath = resolveGitHead(cwd);
    if (!headPath) return null;
    const head = fs.readFileSync(headPath, "utf-8").trim();
    if (!head) return null;
    if (head.startsWith("ref:")) {
      const ref = head.replace(/^ref:\s*/i, "").trim();
      const refPath = path.resolve(path.dirname(headPath), ref);
      const refHash = fs.readFileSync(refPath, "utf-8").trim();
      return formatCommit(refHash);
    }
    return formatCommit(head);
  } catch {
    return null;
  }
}

export const resolveCommitHash = (options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}) => {
  const env = options.env ?? process.env;
  const envCommit = env.GIT_COMMIT?.trim() || env.GIT_SHA?.trim();
  const normalized = formatCommit(envCommit);
  if (normalized) {
    if (cachedCommit === undefined) cachedCommit = normalized;
    return normalized;
  }

  if (options.cwd) {
    return resolveCommitForDir(options.cwd);
  }

  if (cachedCommit !== undefined) {
    return cachedCommit;
  }
  const buildInfoCommit = readCommitFromBuildInfo();
  if (buildInfoCommit) {
    cachedCommit = buildInfoCommit;
    return cachedCommit;
  }
  const pkgCommit = readCommitFromPackageJson();
  if (pkgCommit) {
    cachedCommit = pkgCommit;
    return cachedCommit;
  }
  try {
    const headPath = resolveGitHead(process.cwd());
    if (!headPath) {
      cachedCommit = null;
      return cachedCommit;
    }
    const head = fs.readFileSync(headPath, "utf-8").trim();
    if (!head) {
      cachedCommit = null;
      return cachedCommit;
    }
    if (head.startsWith("ref:")) {
      const ref = head.replace(/^ref:\s*/i, "").trim();
      const refPath = path.resolve(path.dirname(headPath), ref);
      const refHash = fs.readFileSync(refPath, "utf-8").trim();
      cachedCommit = formatCommit(refHash);
      return cachedCommit;
    }
    cachedCommit = formatCommit(head);
    return cachedCommit;
  } catch {
    cachedCommit = null;
    return cachedCommit;
  }
};
