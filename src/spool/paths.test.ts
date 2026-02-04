import { describe, it, expect } from "vitest";
import {
  resolveSpoolDir,
  resolveSpoolEventsDir,
  resolveSpoolDeadLetterDir,
  resolveSpoolEventPath,
  resolveSpoolDeadLetterPath,
} from "./paths.js";

describe("spool paths", () => {
  const mockEnv = { HOME: "/home/testuser" };

  it("should resolve spool directory under state dir", () => {
    const dir = resolveSpoolDir(mockEnv);
    expect(dir).toBe("/home/testuser/.openclaw/spool");
  });

  it("should resolve events directory", () => {
    const dir = resolveSpoolEventsDir(mockEnv);
    expect(dir).toBe("/home/testuser/.openclaw/spool/events");
  });

  it("should resolve dead-letter directory", () => {
    const dir = resolveSpoolDeadLetterDir(mockEnv);
    expect(dir).toBe("/home/testuser/.openclaw/spool/dead-letter");
  });

  it("should resolve event file path", () => {
    const eventPath = resolveSpoolEventPath("test-event-id", mockEnv);
    expect(eventPath).toBe("/home/testuser/.openclaw/spool/events/test-event-id.json");
  });

  it("should resolve dead-letter file path", () => {
    const deadLetterPath = resolveSpoolDeadLetterPath("test-event-id", mockEnv);
    expect(deadLetterPath).toBe("/home/testuser/.openclaw/spool/dead-letter/test-event-id.json");
  });

  it("should respect OPENCLAW_STATE_DIR override", () => {
    const customEnv = {
      HOME: "/home/testuser",
      OPENCLAW_STATE_DIR: "/custom/state/dir",
    };
    const dir = resolveSpoolDir(customEnv);
    expect(dir).toBe("/custom/state/dir/spool");
  });

  it("should respect OPENCLAW_PROFILE suffix", () => {
    const profileEnv = {
      HOME: "/home/testuser",
      OPENCLAW_PROFILE: "test",
    };
    const dir = resolveSpoolDir(profileEnv);
    expect(dir).toBe("/home/testuser/.openclaw-test/spool");
  });
});
