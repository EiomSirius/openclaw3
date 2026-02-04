import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CronService } from "./service.js";

const noopLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

async function makeStorePath() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-cron-"));
  return {
    storePath: path.join(dir, "cron", "jobs.json"),
    cleanup: async () => {
      await fs.rm(dir, { recursive: true, force: true });
    },
  };
}

describe("CronService - failure handling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-12-13T00:00:00.000Z"));
    noopLogger.debug.mockClear();
    noopLogger.info.mockClear();
    noopLogger.warn.mockClear();
    noopLogger.error.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("disables isolated job after MAX_CONSECUTIVE_FAILURES", async () => {
    const store = await makeStorePath();
    const enqueueSystemEvent = vi.fn();
    const requestHeartbeatNow = vi.fn();

    // Mock a job that always fails
    const runIsolatedAgentJob = vi.fn(async () => ({
      status: "error" as const,
      error: "Command failed: process_that_does_not_exist_xyz",
    }));

    const cron = new CronService({
      storePath: store.storePath,
      cronEnabled: true,
      log: noopLogger,
      enqueueSystemEvent,
      requestHeartbeatNow,
      runIsolatedAgentJob,
    });

    await cron.start();

    // Create an "every" schedule job that will retry on failure
    const job = await cron.add({
      name: "failing isolated task",
      enabled: true,
      schedule: { kind: "every", everyMs: 1000 }, // Retry every 1 second
      sessionTarget: "isolated",
      wakeMode: "now",
      payload: {
        kind: "agentTurn",
        message: "Execute: pkill -f 'process_that_does_not_exist_xyz'",
      },
    });

    expect(job.enabled).toBe(true);
    expect(job.state.consecutiveFailures).toBeUndefined();

    // First failure
    vi.setSystemTime(new Date("2025-12-13T00:00:01.000Z"));
    await vi.runOnlyPendingTimersAsync();
    let jobs = await cron.list({ includeDisabled: true });
    let updated = jobs.find((j) => j.id === job.id);
    expect(updated?.state.lastStatus).toBe("error");
    expect(updated?.state.consecutiveFailures).toBe(1);
    expect(updated?.enabled).toBe(true);

    // Second failure - backoff is 1s (2^0 * 1000ms), so wait until T+2s
    vi.setSystemTime(new Date("2025-12-13T00:00:03.000Z"));
    await vi.runOnlyPendingTimersAsync();
    jobs = await cron.list({ includeDisabled: true });
    updated = jobs.find((j) => j.id === job.id);
    expect(updated?.state.lastStatus).toBe("error");
    expect(updated?.state.consecutiveFailures).toBe(2);
    expect(updated?.enabled).toBe(true);

    // Third failure - backoff is 2s (2^1 * 1000ms), so wait until T+5s
    vi.setSystemTime(new Date("2025-12-13T00:00:06.000Z"));
    await vi.runOnlyPendingTimersAsync();
    jobs = await cron.list({ includeDisabled: true });
    updated = jobs.find((j) => j.id === job.id);
    expect(updated?.state.lastStatus).toBe("error");
    expect(updated?.state.consecutiveFailures).toBe(3);
    expect(updated?.enabled).toBe(false); // Job should be disabled
    expect(updated?.state.nextRunAtMs).toBeUndefined(); // No next run scheduled

    // Verify it doesn't run again
    const callsBefore = runIsolatedAgentJob.mock.calls.length;
    vi.setSystemTime(new Date("2025-12-13T00:00:04.000Z"));
    await vi.runOnlyPendingTimersAsync();
    expect(runIsolatedAgentJob.mock.calls.length).toBe(callsBefore); // No additional calls

    // Check that an error was logged
    expect(noopLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: job.id,
        failures: 3,
      }),
      expect.stringContaining("consecutive failures"),
    );

    cron.stop();
    await store.cleanup();
  });

  it("resets consecutiveFailures counter on success", async () => {
    const store = await makeStorePath();
    const enqueueSystemEvent = vi.fn();
    const requestHeartbeatNow = vi.fn();

    let failCount = 0;
    const runIsolatedAgentJob = vi.fn(async () => {
      failCount++;
      // Fail twice, then succeed
      if (failCount <= 2) {
        return { status: "error" as const, error: "Temporary error" };
      }
      return { status: "ok" as const, summary: "Success" };
    });

    const cron = new CronService({
      storePath: store.storePath,
      cronEnabled: true,
      log: noopLogger,
      enqueueSystemEvent,
      requestHeartbeatNow,
      runIsolatedAgentJob,
    });

    await cron.start();

    const job = await cron.add({
      name: "intermittent failure",
      enabled: true,
      schedule: { kind: "every", everyMs: 1000 },
      sessionTarget: "isolated",
      wakeMode: "now",
      payload: { kind: "agentTurn", message: "test" },
    });

    // First failure
    vi.setSystemTime(new Date("2025-12-13T00:00:01.000Z"));
    await vi.runOnlyPendingTimersAsync();
    let jobs = await cron.list({ includeDisabled: true });
    let updated = jobs.find((j) => j.id === job.id);
    expect(updated?.state.consecutiveFailures).toBe(1);

    // Second failure - backoff is 1s, wait until T+2s
    vi.setSystemTime(new Date("2025-12-13T00:00:03.000Z"));
    await vi.runOnlyPendingTimersAsync();
    jobs = await cron.list({ includeDisabled: true });
    updated = jobs.find((j) => j.id === job.id);
    expect(updated?.state.consecutiveFailures).toBe(2);

    // Success - backoff is 2s, wait until T+5s
    vi.setSystemTime(new Date("2025-12-13T00:00:06.000Z"));
    await vi.runOnlyPendingTimersAsync();
    jobs = await cron.list({ includeDisabled: true });
    updated = jobs.find((j) => j.id === job.id);
    expect(updated?.state.lastStatus).toBe("ok");
    expect(updated?.state.consecutiveFailures).toBe(0);
    expect(updated?.enabled).toBe(true);

    cron.stop();
    await store.cleanup();
  });

  it("applies exponential backoff to isolated tasks", async () => {
    const store = await makeStorePath();
    const enqueueSystemEvent = vi.fn();
    const requestHeartbeatNow = vi.fn();

    const runIsolatedAgentJob = vi.fn(async () => ({
      status: "error" as const,
      error: "Always fails",
    }));

    const cron = new CronService({
      storePath: store.storePath,
      cronEnabled: true,
      log: noopLogger,
      enqueueSystemEvent,
      requestHeartbeatNow,
      runIsolatedAgentJob,
    });

    await cron.start();

    const job = await cron.add({
      name: "backoff test",
      enabled: true,
      schedule: { kind: "every", everyMs: 100 }, // Very short interval
      sessionTarget: "isolated",
      wakeMode: "now",
      payload: { kind: "agentTurn", message: "test" },
    });

    // First failure at T=1s
    vi.setSystemTime(new Date("2025-12-13T00:00:01.000Z"));
    await vi.runOnlyPendingTimersAsync();
    let jobs = await cron.list({ includeDisabled: true });
    let updated = jobs.find((j) => j.id === job.id);
    expect(updated?.state.consecutiveFailures).toBe(1);
    expect(updated?.state.lastStatus).toBe("error");

    // Should have backoff delay of ~1000ms (2^0 * 1000)
    const backoffAfterFirst = updated?.state.backoffUntilMs;
    expect(backoffAfterFirst).toBeDefined();

    // Advance past first backoff (1s backoff, so wait until T=3s to be safe)
    vi.setSystemTime(new Date("2025-12-13T00:00:03.000Z"));
    await vi.runOnlyPendingTimersAsync();
    jobs = await cron.list({ includeDisabled: true });
    updated = jobs.find((j) => j.id === job.id);
    expect(updated?.state.consecutiveFailures).toBe(2);

    // Should have longer backoff delay of ~2000ms (2^1 * 1000)
    const backoffAfterSecond = updated?.state.backoffUntilMs;
    expect(backoffAfterSecond).toBeGreaterThan(backoffAfterFirst!);

    cron.stop();
    await store.cleanup();
  });

  it("one-shot 'at' jobs are disabled after first failure", async () => {
    const store = await makeStorePath();
    const enqueueSystemEvent = vi.fn();
    const requestHeartbeatNow = vi.fn();

    const runIsolatedAgentJob = vi.fn(async () => ({
      status: "error" as const,
      error: "Command not found",
    }));

    const cron = new CronService({
      storePath: store.storePath,
      cronEnabled: true,
      log: noopLogger,
      enqueueSystemEvent,
      requestHeartbeatNow,
      runIsolatedAgentJob,
    });

    await cron.start();

    const atMs = Date.parse("2025-12-13T00:00:01.000Z");
    const job = await cron.add({
      name: "one-shot failing task",
      enabled: true,
      schedule: { kind: "at", atMs },
      sessionTarget: "isolated",
      wakeMode: "now",
      payload: {
        kind: "agentTurn",
        message: "Execute: pkill -f 'process_that_does_not_exist_xyz'",
      },
    });

    vi.setSystemTime(new Date("2025-12-13T00:00:01.000Z"));
    await vi.runOnlyPendingTimersAsync();

    const jobs = await cron.list({ includeDisabled: true });
    const updated = jobs.find((j) => j.id === job.id);

    // Should fail and be disabled after 3 consecutive failures
    expect(updated?.state.lastStatus).toBe("error");
    expect(updated?.state.consecutiveFailures).toBe(1);

    // Verify only called once (not infinite loop)
    expect(runIsolatedAgentJob.mock.calls.length).toBe(1);

    cron.stop();
    await store.cleanup();
  });
});
