/**
 * Tool Hook Wrappers
 *
 * Wraps tool execute methods to fire after_tool_call plugin hooks.
 * Note: before_tool_call is handled separately in handleToolExecutionStart (#6570)
 */

import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import type { HookRunner } from "../plugins/hooks.js";
import type { AnyAgentTool } from "./pi-tools.types.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("tools/hooks");

/**
 * Wrap a single AgentTool's execute method to fire after_tool_call hooks.
 */
export function wrapToolWithHooks(
  tool: AnyAgentTool,
  hookRunner: HookRunner,
  ctx: { agentId?: string; sessionKey?: string },
): AnyAgentTool {
  const originalExecute = tool.execute;
  if (!originalExecute) {
    return tool;
  }

  const toolName = tool.name;

  return {
    ...tool,
    execute: async (toolCallId, params, signal, onUpdate): Promise<AgentToolResult<unknown>> => {
      const hookCtx = {
        agentId: ctx.agentId,
        sessionKey: ctx.sessionKey,
        toolName,
      };

      const startMs = Date.now();
      let result: AgentToolResult<unknown> | undefined;
      let error: string | undefined;
      try {
        result = await originalExecute(toolCallId, params, signal, onUpdate);
        return result;
      } catch (err) {
        error = String(err);
        throw err;
      } finally {
        // --- after_tool_call (fire-and-forget) ---
        if (hookRunner.hasHooks("after_tool_call")) {
          hookRunner
            .runAfterToolCall(
              {
                toolName,
                params: (params ?? {}) as Record<string, unknown>,
                result,
                error,
                durationMs: Date.now() - startMs,
              },
              hookCtx,
            )
            .catch((hookErr) => {
              log.debug(`after_tool_call hook error for ${toolName}: ${String(hookErr)}`);
            });
        }
      }
    },
  };
}

/**
 * Wrap a single ToolDefinition's execute method to fire after_tool_call hooks.
 * ToolDefinition uses a different execute signature: (toolCallId, params, onUpdate, ctx, signal)
 */
export function wrapToolDefinitionWithHooks<T extends ToolDefinition>(
  tool: T,
  hookRunner: HookRunner,
  ctx: { agentId?: string; sessionKey?: string },
): T {
  if (!tool.execute) {
    return tool;
  }
  // Bind to preserve context in case execute uses `this`
  const originalExecute = tool.execute.bind(tool);
  const toolName = tool.name;

  return {
    ...tool,
    execute: async (
      toolCallId,
      params,
      onUpdate,
      extCtx,
      signal,
    ): Promise<AgentToolResult<unknown>> => {
      const hookCtx = {
        agentId: ctx.agentId,
        sessionKey: ctx.sessionKey,
        toolName,
      };

      const startMs = Date.now();
      let result: AgentToolResult<unknown> | undefined;
      let error: string | undefined;
      try {
        result = await originalExecute(toolCallId, params, onUpdate, extCtx, signal);
        return result;
      } catch (err) {
        error = String(err);
        throw err;
      } finally {
        // --- after_tool_call (fire-and-forget) ---
        if (hookRunner.hasHooks("after_tool_call")) {
          hookRunner
            .runAfterToolCall(
              {
                toolName,
                params: (params ?? {}) as Record<string, unknown>,
                result,
                error,
                durationMs: Date.now() - startMs,
              },
              hookCtx,
            )
            .catch((hookErr) => {
              log.debug(`after_tool_call hook error for ${toolName}: ${String(hookErr)}`);
            });
        }
      }
    },
  } as T;
}

/**
 * Wrap all AgentTools in an array with after_tool_call hooks.
 * Returns the original array unchanged if no after_tool_call hooks are registered.
 */
export function wrapToolsWithHooks(
  tools: AnyAgentTool[],
  hookRunner: HookRunner,
  ctx: { agentId?: string; sessionKey?: string },
): AnyAgentTool[] {
  if (!hookRunner.hasHooks("after_tool_call")) {
    return tools;
  }
  return tools.map((tool) => wrapToolWithHooks(tool, hookRunner, ctx));
}

/**
 * Wrap all ToolDefinitions in an array with after_tool_call hooks.
 * Returns the original array unchanged if no after_tool_call hooks are registered.
 */
export function wrapToolDefinitionsWithHooks<T extends ToolDefinition>(
  tools: T[],
  hookRunner: HookRunner,
  ctx: { agentId?: string; sessionKey?: string },
): T[] {
  if (!hookRunner.hasHooks("after_tool_call")) {
    return tools;
  }
  return tools.map((tool) => wrapToolDefinitionWithHooks(tool, hookRunner, ctx));
}
