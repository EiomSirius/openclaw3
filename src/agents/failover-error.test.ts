import { describe, expect, it } from "vitest";
import {
  coerceToFailoverError,
  describeFailoverError,
  resolveFailoverReasonFromError,
} from "./failover-error.js";

describe("failover-error", () => {
  it("infers failover reason from HTTP status", () => {
    expect(resolveFailoverReasonFromError({ status: 402 })).toBe("billing");
    expect(resolveFailoverReasonFromError({ statusCode: "429" })).toBe("rate_limit");
    expect(resolveFailoverReasonFromError({ status: 403 })).toBe("auth");
    expect(resolveFailoverReasonFromError({ status: 408 })).toBe("timeout");
  });

  it("infers server_error from HTTP 5xx status codes", () => {
    expect(resolveFailoverReasonFromError({ status: 500 })).toBe("server_error");
    expect(resolveFailoverReasonFromError({ status: 502 })).toBe("server_error");
    expect(resolveFailoverReasonFromError({ status: 503 })).toBe("server_error");
    expect(resolveFailoverReasonFromError({ status: 529 })).toBe("server_error");
  });

  it("does not treat other 5xx codes as failover-worthy", () => {
    // 504 Gateway Timeout - common during provider outages
    expect(resolveFailoverReasonFromError({ status: 504 })).toBe("server_error");
    expect(resolveFailoverReasonFromError({ status: 501 })).toBe(null);
  });

  it("infers format errors from error messages", () => {
    expect(
      resolveFailoverReasonFromError({
        message: "invalid request format: messages.1.content.1.tool_use.id",
      }),
    ).toBe("format");
  });

  it("infers timeout from common node error codes", () => {
    expect(resolveFailoverReasonFromError({ code: "ETIMEDOUT" })).toBe("timeout");
    expect(resolveFailoverReasonFromError({ code: "ECONNRESET" })).toBe("timeout");
  });

  it("coerces failover-worthy errors into FailoverError with metadata", () => {
    const err = coerceToFailoverError("credit balance too low", {
      provider: "anthropic",
      model: "claude-opus-4-5",
    });
    expect(err?.name).toBe("FailoverError");
    expect(err?.reason).toBe("billing");
    expect(err?.status).toBe(402);
    expect(err?.provider).toBe("anthropic");
    expect(err?.model).toBe("claude-opus-4-5");
  });

  it("coerces format errors with a 400 status", () => {
    const err = coerceToFailoverError("invalid request format", {
      provider: "google",
      model: "cloud-code-assist",
    });
    expect(err?.reason).toBe("format");
    expect(err?.status).toBe(400);
  });

  it("coerces HTTP 5xx errors into FailoverError with server_error reason", () => {
    const err = coerceToFailoverError(
      Object.assign(new Error("Internal Server Error"), { status: 500 }),
      { provider: "openai", model: "gpt-4" },
    );
    expect(err?.name).toBe("FailoverError");
    expect(err?.reason).toBe("server_error");
    expect(err?.status).toBe(500);
    expect(err?.provider).toBe("openai");
    expect(err?.model).toBe("gpt-4");
  });

  it("coerces HTTP 503 service unavailable errors", () => {
    const err = coerceToFailoverError(
      Object.assign(new Error("Service Unavailable"), { status: 503 }),
      { provider: "anthropic", model: "claude-sonnet-4" },
    );
    expect(err?.reason).toBe("server_error");
    expect(err?.status).toBe(503);
  });

  it("coerces HTTP 529 overloaded errors", () => {
    const err = coerceToFailoverError(
      Object.assign(new Error("Site Overloaded"), { status: 529 }),
      { provider: "anthropic", model: "claude-opus-4" },
    );
    expect(err?.reason).toBe("server_error");
    expect(err?.status).toBe(529);
  });

  it("describes non-Error values consistently", () => {
    const described = describeFailoverError(123);
    expect(described.message).toBe("123");
    expect(described.reason).toBeUndefined();
  });
});
