import type { OpenClawConfig } from "../config/config.js";
import type { DispatchFromConfigResult } from "./reply/dispatch-from-config.js";
import type { FinalizedMsgContext, MsgContext } from "./templating.js";
import type { GetReplyOptions } from "./types.js";
import { createInternalHookEvent, triggerInternalHook } from "../hooks/internal-hooks.js";
import { dispatchReplyFromConfig } from "./reply/dispatch-from-config.js";
import { finalizeInboundContext } from "./reply/inbound-context.js";
import {
  createReplyDispatcher,
  createReplyDispatcherWithTyping,
  type ReplyDispatcher,
  type ReplyDispatcherOptions,
  type ReplyDispatcherWithTypingOptions,
} from "./reply/reply-dispatcher.js";

export type DispatchInboundResult = DispatchFromConfigResult;

export async function dispatchInboundMessage(params: {
  ctx: MsgContext | FinalizedMsgContext;
  cfg: OpenClawConfig;
  dispatcher: ReplyDispatcher;
  replyOptions?: Omit<GetReplyOptions, "onToolResult" | "onBlockReply">;
  replyResolver?: typeof import("./reply.js").getReplyFromConfig;
}): Promise<DispatchInboundResult> {
  const finalized = finalizeInboundContext(params.ctx);
  const sessionKey = finalized.SessionKey ?? "";

  // Build context for hooks
  const hookContext = {
    source: finalized.Surface ?? finalized.Provider ?? "unknown",
    senderId: finalized.SenderId,
    senderName: finalized.SenderName,
    chatType: finalized.ChatType,
    groupSubject: finalized.GroupSubject,
    messagePreview: finalized.RawBody?.slice(0, 100),
  };

  // Trigger turn_start hook (fire-and-forget to avoid blocking dispatch)
  const startEvent = createInternalHookEvent("agent", "turn_start", sessionKey, hookContext);
  triggerInternalHook(startEvent).catch((err) => {
    console.error("[hooks] turn_start error:", err instanceof Error ? err.message : String(err));
  });

  let result: DispatchFromConfigResult;
  let success = false;
  try {
    result = await dispatchReplyFromConfig({
      ctx: finalized,
      cfg: params.cfg,
      dispatcher: params.dispatcher,
      replyOptions: params.replyOptions,
      replyResolver: params.replyResolver,
    });
    success = true;
  } finally {
    // Trigger turn_end hook (fire-and-forget, always runs)
    const endEvent = createInternalHookEvent("agent", "turn_end", sessionKey, {
      ...hookContext,
      success,
    });
    triggerInternalHook(endEvent).catch((err) => {
      console.error("[hooks] turn_end error:", err instanceof Error ? err.message : String(err));
    });
  }

  return result;
}

export async function dispatchInboundMessageWithBufferedDispatcher(params: {
  ctx: MsgContext | FinalizedMsgContext;
  cfg: OpenClawConfig;
  dispatcherOptions: ReplyDispatcherWithTypingOptions;
  replyOptions?: Omit<GetReplyOptions, "onToolResult" | "onBlockReply">;
  replyResolver?: typeof import("./reply.js").getReplyFromConfig;
}): Promise<DispatchInboundResult> {
  const { dispatcher, replyOptions, markDispatchIdle } = createReplyDispatcherWithTyping(
    params.dispatcherOptions,
  );

  const result = await dispatchInboundMessage({
    ctx: params.ctx,
    cfg: params.cfg,
    dispatcher,
    replyResolver: params.replyResolver,
    replyOptions: {
      ...params.replyOptions,
      ...replyOptions,
    },
  });

  markDispatchIdle();
  return result;
}

export async function dispatchInboundMessageWithDispatcher(params: {
  ctx: MsgContext | FinalizedMsgContext;
  cfg: OpenClawConfig;
  dispatcherOptions: ReplyDispatcherOptions;
  replyOptions?: Omit<GetReplyOptions, "onToolResult" | "onBlockReply">;
  replyResolver?: typeof import("./reply.js").getReplyFromConfig;
}): Promise<DispatchInboundResult> {
  const dispatcher = createReplyDispatcher(params.dispatcherOptions);
  const result = await dispatchInboundMessage({
    ctx: params.ctx,
    cfg: params.cfg,
    dispatcher,
    replyResolver: params.replyResolver,
    replyOptions: params.replyOptions,
  });
  await dispatcher.waitForIdle();
  return result;
}
