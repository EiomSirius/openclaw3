import { describe, expect, it } from "vitest";
import { sanitizeNpmInstallEnv } from "./exec.js";

describe("sanitizeNpmInstallEnv", () => {
  it("filters sensitive API keys from environment", () => {
    const env = sanitizeNpmInstallEnv({
      PATH: "/usr/bin",
      HOME: "/home/user",
      OPENAI_API_KEY: "sk-secret-openai-key",
      ANTHROPIC_API_KEY: "sk-ant-secret-key",
      GOOGLE_API_KEY: "google-secret",
      AWS_SECRET_ACCESS_KEY: "aws-secret",
      AZURE_API_KEY: "azure-secret",
      GITHUB_TOKEN: "ghp_secret",
      NPM_TOKEN: "npm_secret",
      NODE_AUTH_TOKEN: "node-auth-secret",
      SAFE_VAR: "safe-value",
    });

    // Should preserve safe variables
    expect(env.PATH).toBe("/usr/bin");
    expect(env.HOME).toBe("/home/user");
    expect(env.SAFE_VAR).toBe("safe-value");

    // Should filter sensitive credentials
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.GOOGLE_API_KEY).toBeUndefined();
    expect(env.AWS_SECRET_ACCESS_KEY).toBeUndefined();
    expect(env.AZURE_API_KEY).toBeUndefined();
    expect(env.GITHUB_TOKEN).toBeUndefined();
    expect(env.NPM_TOKEN).toBeUndefined();
    expect(env.NODE_AUTH_TOKEN).toBeUndefined();
  });

  it("filters keys containing SECRET, TOKEN, KEY, PASSWORD patterns", () => {
    const env = sanitizeNpmInstallEnv({
      PATH: "/usr/bin",
      MY_SECRET_VALUE: "secret",
      DATABASE_PASSWORD: "dbpass",
      AUTH_TOKEN: "token",
      API_KEY: "key",
      SOME_CREDENTIAL: "cred",
      NORMAL_VAR: "normal",
    });

    expect(env.PATH).toBe("/usr/bin");
    expect(env.NORMAL_VAR).toBe("normal");

    expect(env.MY_SECRET_VALUE).toBeUndefined();
    expect(env.DATABASE_PASSWORD).toBeUndefined();
    expect(env.AUTH_TOKEN).toBeUndefined();
    expect(env.API_KEY).toBeUndefined();
    expect(env.SOME_CREDENTIAL).toBeUndefined();
  });

  it("filters common channel tokens (Discord, Slack, Telegram)", () => {
    const env = sanitizeNpmInstallEnv({
      PATH: "/usr/bin",
      DISCORD_BOT_TOKEN: "discord-secret",
      SLACK_BOT_TOKEN: "slack-secret",
      TELEGRAM_BOT_TOKEN: "telegram-secret",
    });

    expect(env.PATH).toBe("/usr/bin");
    expect(env.DISCORD_BOT_TOKEN).toBeUndefined();
    expect(env.SLACK_BOT_TOKEN).toBeUndefined();
    expect(env.TELEGRAM_BOT_TOKEN).toBeUndefined();
  });

  it("preserves PATH and essential build variables", () => {
    const env = sanitizeNpmInstallEnv({
      PATH: "/usr/local/bin:/usr/bin",
      HOME: "/home/user",
      USER: "testuser",
      SHELL: "/bin/bash",
      TERM: "xterm-256color",
      LANG: "en_US.UTF-8",
      NODE_ENV: "production",
      NPM_CONFIG_FUND: "false",
      COREPACK_ENABLE_DOWNLOAD_PROMPT: "0",
    });

    expect(env.PATH).toBe("/usr/local/bin:/usr/bin");
    expect(env.HOME).toBe("/home/user");
    expect(env.USER).toBe("testuser");
    expect(env.SHELL).toBe("/bin/bash");
    expect(env.TERM).toBe("xterm-256color");
    expect(env.LANG).toBe("en_US.UTF-8");
    expect(env.NODE_ENV).toBe("production");
    expect(env.NPM_CONFIG_FUND).toBe("false");
    expect(env.COREPACK_ENABLE_DOWNLOAD_PROMPT).toBe("0");
  });

  it("uses process.env when no argument provided", () => {
    const prevKey = process.env.OPENAI_API_KEY;
    const prevPath = process.env.PATH;

    process.env.OPENAI_API_KEY = "test-key-to-filter";

    const env = sanitizeNpmInstallEnv();

    // Should have PATH from process.env
    expect(env.PATH).toBe(prevPath);
    // Should NOT have the sensitive key
    expect(env.OPENAI_API_KEY).toBeUndefined();

    // Restore
    if (prevKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = prevKey;
    }
  });
});
