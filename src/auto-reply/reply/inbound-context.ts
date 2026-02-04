import type { MessagingPiiConfig } from "../../config/types.base.js";
import type { FinalizedMsgContext, MsgContext } from "../templating.js";
import { normalizeChatType } from "../../channels/chat-type.js";
import { resolveConversationLabel } from "../../channels/conversation-label.js";
import { DEFAULT_PII_ENTITIES } from "../../logging/pii-patterns.js";
import { detectPiiInText, redactPiiInText } from "../../logging/pii-patterns.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { formatInboundBodyWithSenderMeta } from "./inbound-sender-meta.js";
import { normalizeInboundTextNewlines } from "./inbound-text.js";

const piiLog = createSubsystemLogger("gateway/auto-reply").child("pii");

export type FinalizeInboundContextOptions = {
  forceBodyForAgent?: boolean;
  forceBodyForCommands?: boolean;
  forceChatType?: boolean;
  forceConversationLabel?: boolean;
  /** When set, PII detect/redact at ingestion uses this (messaging.piiAtIngestion, messaging.redactPiiEntities). */
  cfg?: { messaging?: MessagingPiiConfig };
};

function normalizeTextField(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  return normalizeInboundTextNewlines(value);
}

export function finalizeInboundContext<T extends Record<string, unknown>>(
  ctx: T,
  opts: FinalizeInboundContextOptions = {},
): T & FinalizedMsgContext {
  const normalized = ctx as T & MsgContext;

  normalized.Body = normalizeInboundTextNewlines(
    typeof normalized.Body === "string" ? normalized.Body : "",
  );
  normalized.RawBody = normalizeTextField(normalized.RawBody);
  normalized.CommandBody = normalizeTextField(normalized.CommandBody);
  normalized.Transcript = normalizeTextField(normalized.Transcript);
  normalized.ThreadStarterBody = normalizeTextField(normalized.ThreadStarterBody);

  const piiMode = opts.cfg?.messaging?.piiAtIngestion;
  const piiEntities = opts.cfg?.messaging?.redactPiiEntities ?? [...DEFAULT_PII_ENTITIES];

  if (piiMode === "detect") {
    const textFields = [
      normalized.Body,
      normalized.RawBody,
      normalized.CommandBody,
      normalized.Transcript,
      normalized.ThreadStarterBody,
    ].filter((s): s is string => typeof s === "string" && s.length > 0);
    const allDetected = new Set<string>();
    for (const field of textFields) {
      for (const key of detectPiiInText(field, piiEntities)) {
        allDetected.add(key.toUpperCase());
      }
    }
    if (allDetected.size > 0) {
      piiLog.info?.(`PII detected: ${[...allDetected].toSorted().join(", ")}`);
    }
  } else if (piiMode === "redact") {
    if (typeof normalized.Body === "string" && normalized.Body) {
      normalized.Body = redactPiiInText(normalized.Body, piiEntities);
    }
    if (typeof normalized.RawBody === "string" && normalized.RawBody) {
      normalized.RawBody = redactPiiInText(normalized.RawBody, piiEntities);
    }
    if (typeof normalized.CommandBody === "string" && normalized.CommandBody) {
      normalized.CommandBody = redactPiiInText(normalized.CommandBody, piiEntities);
    }
    if (typeof normalized.Transcript === "string" && normalized.Transcript) {
      normalized.Transcript = redactPiiInText(normalized.Transcript, piiEntities);
    }
    if (typeof normalized.ThreadStarterBody === "string" && normalized.ThreadStarterBody) {
      normalized.ThreadStarterBody = redactPiiInText(normalized.ThreadStarterBody, piiEntities);
    }
  }

  const chatType = normalizeChatType(normalized.ChatType);
  if (chatType && (opts.forceChatType || normalized.ChatType !== chatType)) {
    normalized.ChatType = chatType;
  }

  const bodyForAgentSource = opts.forceBodyForAgent
    ? normalized.Body
    : (normalized.BodyForAgent ?? normalized.Body);
  normalized.BodyForAgent = normalizeInboundTextNewlines(bodyForAgentSource);

  const bodyForCommandsSource = opts.forceBodyForCommands
    ? (normalized.CommandBody ?? normalized.RawBody ?? normalized.Body)
    : (normalized.BodyForCommands ??
      normalized.CommandBody ??
      normalized.RawBody ??
      normalized.Body);
  normalized.BodyForCommands = normalizeInboundTextNewlines(bodyForCommandsSource);

  const explicitLabel = normalized.ConversationLabel?.trim();
  if (opts.forceConversationLabel || !explicitLabel) {
    const resolved = resolveConversationLabel(normalized)?.trim();
    if (resolved) {
      normalized.ConversationLabel = resolved;
    }
  } else {
    normalized.ConversationLabel = explicitLabel;
  }

  // Ensure group/channel messages retain a sender meta line even when the body is a
  // structured envelope (e.g. "[Signal ...] Alice: hi").
  normalized.Body = formatInboundBodyWithSenderMeta({ ctx: normalized, body: normalized.Body });
  normalized.BodyForAgent = formatInboundBodyWithSenderMeta({
    ctx: normalized,
    body: normalized.BodyForAgent,
  });

  // Always set. Default-deny when upstream forgets to populate it.
  normalized.CommandAuthorized = normalized.CommandAuthorized === true;

  return normalized as T & FinalizedMsgContext;
}
