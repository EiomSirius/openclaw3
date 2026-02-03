import { describe, expect, it } from "vitest";
import {
  isAbortError,
  isTransientNetworkError,
  isUndiciTlsNullError,
} from "./unhandled-rejections.js";

describe("isAbortError", () => {
  it("returns true for error with name AbortError", () => {
    const error = new Error("aborted");
    error.name = "AbortError";
    expect(isAbortError(error)).toBe(true);
  });

  it('returns true for error with "This operation was aborted" message', () => {
    const error = new Error("This operation was aborted");
    expect(isAbortError(error)).toBe(true);
  });

  it("returns true for undici-style AbortError", () => {
    // Node's undici throws errors with this exact message
    const error = Object.assign(new Error("This operation was aborted"), { name: "AbortError" });
    expect(isAbortError(error)).toBe(true);
  });

  it("returns true for object with AbortError name", () => {
    expect(isAbortError({ name: "AbortError", message: "test" })).toBe(true);
  });

  it("returns false for regular errors", () => {
    expect(isAbortError(new Error("Something went wrong"))).toBe(false);
    expect(isAbortError(new TypeError("Cannot read property"))).toBe(false);
    expect(isAbortError(new RangeError("Invalid array length"))).toBe(false);
  });

  it("returns false for errors with similar but different messages", () => {
    expect(isAbortError(new Error("Operation aborted"))).toBe(false);
    expect(isAbortError(new Error("aborted"))).toBe(false);
    expect(isAbortError(new Error("Request was aborted"))).toBe(false);
  });

  it("returns false for null and undefined", () => {
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError(undefined)).toBe(false);
  });

  it("returns false for non-error values", () => {
    expect(isAbortError("string error")).toBe(false);
    expect(isAbortError(42)).toBe(false);
  });

  it("returns false for plain objects without AbortError name", () => {
    expect(isAbortError({ message: "plain object" })).toBe(false);
  });
});

describe("isTransientNetworkError", () => {
  it("returns true for errors with transient network codes", () => {
    const codes = [
      "ECONNRESET",
      "ECONNREFUSED",
      "ENOTFOUND",
      "ETIMEDOUT",
      "ESOCKETTIMEDOUT",
      "ECONNABORTED",
      "EPIPE",
      "EHOSTUNREACH",
      "ENETUNREACH",
      "EAI_AGAIN",
      "UND_ERR_CONNECT_TIMEOUT",
      "UND_ERR_SOCKET",
      "UND_ERR_HEADERS_TIMEOUT",
      "UND_ERR_BODY_TIMEOUT",
    ];

    for (const code of codes) {
      const error = Object.assign(new Error("test"), { code });
      expect(isTransientNetworkError(error), `code: ${code}`).toBe(true);
    }
  });

  it('returns true for TypeError with "fetch failed" message', () => {
    const error = new TypeError("fetch failed");
    expect(isTransientNetworkError(error)).toBe(true);
  });

  it("returns true for fetch failed with network cause", () => {
    const cause = Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" });
    const error = Object.assign(new TypeError("fetch failed"), { cause });
    expect(isTransientNetworkError(error)).toBe(true);
  });

  it("returns true for nested cause chain with network error", () => {
    const innerCause = Object.assign(new Error("connection reset"), { code: "ECONNRESET" });
    const outerCause = Object.assign(new Error("wrapper"), { cause: innerCause });
    const error = Object.assign(new TypeError("fetch failed"), { cause: outerCause });
    expect(isTransientNetworkError(error)).toBe(true);
  });

  it("returns true for AggregateError containing network errors", () => {
    const networkError = Object.assign(new Error("timeout"), { code: "ETIMEDOUT" });
    const error = new AggregateError([networkError], "Multiple errors");
    expect(isTransientNetworkError(error)).toBe(true);
  });

  it("returns false for regular errors without network codes", () => {
    expect(isTransientNetworkError(new Error("Something went wrong"))).toBe(false);
    expect(isTransientNetworkError(new TypeError("Cannot read property"))).toBe(false);
    expect(isTransientNetworkError(new RangeError("Invalid array length"))).toBe(false);
  });

  it("returns false for errors with non-network codes", () => {
    const error = Object.assign(new Error("test"), { code: "INVALID_CONFIG" });
    expect(isTransientNetworkError(error)).toBe(false);
  });

  it("returns false for null and undefined", () => {
    expect(isTransientNetworkError(null)).toBe(false);
    expect(isTransientNetworkError(undefined)).toBe(false);
  });

  it("returns false for non-error values", () => {
    expect(isTransientNetworkError("string error")).toBe(false);
    expect(isTransientNetworkError(42)).toBe(false);
    expect(isTransientNetworkError({ message: "plain object" })).toBe(false);
  });

  it("returns false for AggregateError with only non-network errors", () => {
    const error = new AggregateError([new Error("regular error")], "Multiple errors");
    expect(isTransientNetworkError(error)).toBe(false);
  });

  it("returns true for undici TLS session null error (#6201)", () => {
    const err = new TypeError("Cannot read properties of null (reading 'setSession')");
    err.stack = `TypeError: Cannot read properties of null (reading 'setSession')
    at TLSSocket.setSession (node:_tls_wrap:1132:16)
    at Client.connect (undici/lib/core/connect.js:70:20)`;
    expect(isTransientNetworkError(err)).toBe(true);
  });
});

describe("isUndiciTlsNullError", () => {
  it("detects TLS session null crash from undici (new message format)", () => {
    const err = new TypeError("Cannot read properties of null (reading 'setSession')");
    err.stack = `TypeError: Cannot read properties of null (reading 'setSession')
    at TLSSocket.setSession (node:_tls_wrap:1132:16)
    at Client.connect (undici/lib/core/connect.js:70:20)`;
    expect(isUndiciTlsNullError(err)).toBe(true);
  });

  it("detects TLS session null crash (old message format)", () => {
    const err = new TypeError("Cannot read property 'setSession' of null");
    err.stack = `TypeError: Cannot read property 'setSession' of null
    at TLSSocket.setSession (node:_tls_wrap:1132:16)
    at Client.connect (undici/lib/core/connect.js:70:20)`;
    expect(isUndiciTlsNullError(err)).toBe(true);
  });

  it("detects error with node:_tls_wrap in stack", () => {
    const err = new TypeError("Cannot read properties of null (reading 'setSession')");
    err.stack = `TypeError: Cannot read properties of null (reading 'setSession')
    at TLSSocket.setSession (node:_tls_wrap:1132:16)`;
    expect(isUndiciTlsNullError(err)).toBe(true);
  });

  it("rejects error without TLSSocket.setSession in stack", () => {
    // This was previously accepted but is now rejected to avoid false positives
    const err = new TypeError("Cannot read properties of null (reading 'setSession')");
    err.stack = `TypeError: Cannot read properties of null (reading 'setSession')
    at TLSSocket.doSomething (somewhere:1:1)`;
    expect(isUndiciTlsNullError(err)).toBe(false);
  });

  it("rejects error with undici but no TLSSocket.setSession", () => {
    // Must have TLSSocket.setSession to confirm it's the known race condition
    const err = new TypeError("Cannot read properties of null (reading 'setSession')");
    err.stack = `TypeError: Cannot read properties of null (reading 'setSession')
    at something (undici/lib/core/connect.js:70:20)`;
    expect(isUndiciTlsNullError(err)).toBe(false);
  });

  it("rejects unrelated TypeError", () => {
    const err = new TypeError("foo is not a function");
    expect(isUndiciTlsNullError(err)).toBe(false);
  });

  it("rejects TypeError without setSession in message", () => {
    const err = new TypeError("Cannot read properties of null (reading 'foo')");
    err.stack = `TypeError: Cannot read properties of null (reading 'foo')
    at TLSSocket.setSession (node:_tls_wrap:1132:16)`;
    expect(isUndiciTlsNullError(err)).toBe(false);
  });

  it("rejects TypeError without null in message", () => {
    const err = new TypeError("Cannot read properties of undefined (reading 'setSession')");
    err.stack = `TypeError: Cannot read properties of undefined (reading 'setSession')
    at TLSSocket.setSession (node:_tls_wrap:1132:16)`;
    expect(isUndiciTlsNullError(err)).toBe(false);
  });

  it("rejects TypeError with correct message but unrelated stack", () => {
    const err = new TypeError("Cannot read properties of null (reading 'setSession')");
    err.stack = `TypeError: Cannot read properties of null (reading 'setSession')
    at someRandomFunction (random/file.js:1:1)`;
    expect(isUndiciTlsNullError(err)).toBe(false);
  });

  it("rejects non-TypeError errors", () => {
    const err = new Error("Cannot read properties of null (reading 'setSession')");
    err.stack = `Error: Cannot read properties of null (reading 'setSession')
    at TLSSocket.setSession (node:_tls_wrap:1132:16)`;
    expect(isUndiciTlsNullError(err)).toBe(false);
  });

  it("returns false for null and undefined", () => {
    expect(isUndiciTlsNullError(null)).toBe(false);
    expect(isUndiciTlsNullError(undefined)).toBe(false);
  });
});
