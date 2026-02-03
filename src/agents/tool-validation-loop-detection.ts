/**
 * Tool validation loop detection.
 *
 * Detects when the model gets stuck emitting the same broken tool call
 * (typically missing required parameters) and aborts to prevent infinite loops.
 *
 * @see https://github.com/openclaw/openclaw/issues/7500
 */

/** Default threshold for consecutive validation failures before aborting. */
export const DEFAULT_VALIDATION_FAILURE_THRESHOLD = 3;

/** Patterns that indicate a tool validation/schema error (vs runtime error). */
const VALIDATION_ERROR_PATTERNS = [
  /missing required property/i,
  /required property .* is missing/i,
  /must have required property/i,
  /invalid.*parameter/i,
  /expected.*but got/i,
  /schema validation/i,
  /argument.*required/i,
  /missing.*argument/i,
];

/**
 * State for tracking consecutive tool validation failures.
 */
export type ToolValidationLoopState = {
  /** Number of consecutive validation failures. */
  consecutiveValidationFailures: number;
  /** Last tool name that failed validation. */
  lastFailedToolName?: string;
  /** Last error message for deduplication. */
  lastErrorMessage?: string;
};

/**
 * Creates initial state for tool validation loop detection.
 */
export function createToolValidationLoopState(): ToolValidationLoopState {
  return {
    consecutiveValidationFailures: 0,
    lastFailedToolName: undefined,
    lastErrorMessage: undefined,
  };
}

/**
 * Checks if an error message indicates a validation/schema error.
 */
export function isValidationError(errorMessage?: string): boolean {
  if (!errorMessage) {
    return false;
  }
  return VALIDATION_ERROR_PATTERNS.some((pattern) => pattern.test(errorMessage));
}

/**
 * Records a tool execution result and returns whether the loop threshold was exceeded.
 *
 * @param state - The loop detection state to update.
 * @param toolName - Name of the tool that was executed.
 * @param isError - Whether the tool execution resulted in an error.
 * @param errorMessage - The error message, if any.
 * @param threshold - Number of consecutive failures before triggering abort.
 * @returns Object with `shouldAbort` boolean and optional `reason` string.
 */
export function recordToolResult(
  state: ToolValidationLoopState,
  toolName: string,
  isError: boolean,
  errorMessage?: string,
  threshold: number = DEFAULT_VALIDATION_FAILURE_THRESHOLD,
): { shouldAbort: boolean; reason?: string } {
  // If the tool succeeded or the error is not a validation error, reset the counter.
  if (!isError || !isValidationError(errorMessage)) {
    state.consecutiveValidationFailures = 0;
    state.lastFailedToolName = undefined;
    state.lastErrorMessage = undefined;
    return { shouldAbort: false };
  }

  // Track the validation failure.
  state.consecutiveValidationFailures += 1;
  state.lastFailedToolName = toolName;
  state.lastErrorMessage = errorMessage;

  // Check if we've exceeded the threshold.
  if (state.consecutiveValidationFailures >= threshold) {
    return {
      shouldAbort: true,
      reason: `Tool validation loop detected: ${state.consecutiveValidationFailures} consecutive validation failures for tool "${toolName}". Last error: ${errorMessage}`,
    };
  }

  return { shouldAbort: false };
}

/**
 * Resets the loop detection state (e.g., at the start of a new turn).
 */
export function resetToolValidationLoopState(state: ToolValidationLoopState): void {
  state.consecutiveValidationFailures = 0;
  state.lastFailedToolName = undefined;
  state.lastErrorMessage = undefined;
}
