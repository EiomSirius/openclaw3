/**
 * Cron isolated agent turn wrapper.
 *
 * This is a thin wrapper that converts CronJob parameters to the generic
 * IsolatedAgentTurnParams and delegates to runIsolatedAgentTurn().
 */

import type { CliDeps } from "../../cli/deps.js";
import type { OpenClawConfig } from "../../config/config.js";
import type { CronJob } from "../types.js";
import {
  runIsolatedAgentTurn,
  type IsolatedAgentTurnParams,
  type IsolatedAgentTurnResult,
} from "../../agents/isolated-turn/index.js";

export type RunCronAgentTurnResult = IsolatedAgentTurnResult;

/**
 * Run an isolated agent turn for a cron job.
 *
 * This wrapper extracts the relevant parameters from the CronJob and
 * calls the shared runIsolatedAgentTurn() function.
 */
export async function runCronIsolatedAgentTurn(params: {
  cfg: OpenClawConfig;
  deps: CliDeps;
  job: CronJob;
  message: string;
  sessionKey: string;
  agentId?: string;
  lane?: string;
}): Promise<RunCronAgentTurnResult> {
  const { cfg, deps, job, message, sessionKey, agentId, lane } = params;
  const payload = job.payload.kind === "agentTurn" ? job.payload : null;

  // Build IsolatedAgentTurnParams from CronJob
  const isolatedParams: IsolatedAgentTurnParams = {
    cfg,
    deps,
    message,
    sessionKey: sessionKey?.trim() || `cron:${job.id}`,
    agentId: agentId ?? job.agentId,
    lane: lane ?? "cron",

    // Agent options from payload
    model: payload?.model,
    thinking: payload?.thinking,
    timeoutSeconds: payload?.timeoutSeconds,

    // Delivery options from payload
    deliver: payload?.deliver,
    channel: payload?.channel,
    to: payload?.to,
    bestEffortDeliver: payload?.bestEffortDeliver,

    // Security
    allowUnsafeExternalContent: payload?.allowUnsafeExternalContent,

    // Source information for message formatting
    source: {
      type: "cron",
      id: job.id,
      name: job.name ?? `job-${job.id}`,
    },
  };

  return runIsolatedAgentTurn(isolatedParams);
}
