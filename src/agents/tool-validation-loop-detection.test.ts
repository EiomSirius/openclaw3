import { describe, expect, it } from "vitest";
import {
  createToolValidationLoopState,
  isValidationError,
  recordToolResult,
  resetToolValidationLoopState,
  DEFAULT_VALIDATION_FAILURE_THRESHOLD,
} from "./tool-validation-loop-detection.js";

describe("tool-validation-loop-detection", () => {
  describe("isValidationError", () => {
    it("returns true for missing required property errors", () => {
      expect(isValidationError("missing required property 'action'")).toBe(true);
      expect(isValidationError("Required property 'query' is missing")).toBe(true);
      expect(isValidationError("must have required property 'path'")).toBe(true);
    });

    it("returns true for other validation patterns", () => {
      expect(isValidationError("Invalid parameter: expected string")).toBe(true);
      expect(isValidationError("schema validation failed")).toBe(true);
      expect(isValidationError("argument 'url' required")).toBe(true);
    });

    it("returns false for runtime errors", () => {
      expect(isValidationError("Connection timeout")).toBe(false);
      expect(isValidationError("File not found")).toBe(false);
      expect(isValidationError("Permission denied")).toBe(false);
    });

    it("returns false for undefined/empty", () => {
      expect(isValidationError(undefined)).toBe(false);
      expect(isValidationError("")).toBe(false);
    });
  });

  describe("recordToolResult", () => {
    it("does not abort on successful tool calls", () => {
      const state = createToolValidationLoopState();
      const result = recordToolResult(state, "gateway", false);
      expect(result.shouldAbort).toBe(false);
      expect(state.consecutiveValidationFailures).toBe(0);
    });

    it("does not abort on non-validation errors", () => {
      const state = createToolValidationLoopState();
      const result = recordToolResult(state, "exec", true, "Command not found");
      expect(result.shouldAbort).toBe(false);
      expect(state.consecutiveValidationFailures).toBe(0);
    });

    it("increments counter on validation errors", () => {
      const state = createToolValidationLoopState();

      recordToolResult(state, "gateway", true, "missing required property 'action'");
      expect(state.consecutiveValidationFailures).toBe(1);

      recordToolResult(state, "gateway", true, "missing required property 'action'");
      expect(state.consecutiveValidationFailures).toBe(2);
    });

    it("aborts after threshold consecutive validation failures", () => {
      const state = createToolValidationLoopState();

      for (let i = 0; i < DEFAULT_VALIDATION_FAILURE_THRESHOLD - 1; i++) {
        const result = recordToolResult(
          state,
          "gateway",
          true,
          "missing required property 'action'",
        );
        expect(result.shouldAbort).toBe(false);
      }

      const finalResult = recordToolResult(
        state,
        "gateway",
        true,
        "missing required property 'action'",
      );
      expect(finalResult.shouldAbort).toBe(true);
      expect(finalResult.reason).toContain("Tool validation loop detected");
      expect(finalResult.reason).toContain("gateway");
    });

    it("resets counter on successful call after failures", () => {
      const state = createToolValidationLoopState();

      recordToolResult(state, "gateway", true, "missing required property 'action'");
      recordToolResult(state, "gateway", true, "missing required property 'action'");
      expect(state.consecutiveValidationFailures).toBe(2);

      recordToolResult(state, "gateway", false);
      expect(state.consecutiveValidationFailures).toBe(0);
    });

    it("resets counter on non-validation error after failures", () => {
      const state = createToolValidationLoopState();

      recordToolResult(state, "gateway", true, "missing required property 'action'");
      expect(state.consecutiveValidationFailures).toBe(1);

      recordToolResult(state, "exec", true, "Command timed out");
      expect(state.consecutiveValidationFailures).toBe(0);
    });

    it("respects custom threshold", () => {
      const state = createToolValidationLoopState();

      const result1 = recordToolResult(
        state,
        "gateway",
        true,
        "missing required property 'action'",
        2,
      );
      expect(result1.shouldAbort).toBe(false);

      const result2 = recordToolResult(
        state,
        "gateway",
        true,
        "missing required property 'action'",
        2,
      );
      expect(result2.shouldAbort).toBe(true);
    });
  });

  describe("resetToolValidationLoopState", () => {
    it("resets all state fields", () => {
      const state = createToolValidationLoopState();
      state.consecutiveValidationFailures = 5;
      state.lastFailedToolName = "gateway";
      state.lastErrorMessage = "error";

      resetToolValidationLoopState(state);

      expect(state.consecutiveValidationFailures).toBe(0);
      expect(state.lastFailedToolName).toBeUndefined();
      expect(state.lastErrorMessage).toBeUndefined();
    });
  });
});
