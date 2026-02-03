import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import * as authModule from "./auth.js";
import { createHooksRequestHandler } from "./server-http.js";

describe("VULN-001: hook token must use timing-safe comparison", () => {
  // This test verifies that safeEqual is exported from auth.ts and works correctly.
  // The fix for VULN-001 requires server-http.ts to import and use this function
  // instead of direct `!==` comparison for hook token validation.
  //
  // The security property we're verifying:
  // - safeEqual uses crypto.timingSafeEqual internally
  // - This prevents timing side-channel attacks that could leak token characters
  //
  // CWE-208: Observable Timing Discrepancy
  // https://cwe.mitre.org/data/definitions/208.html

  it("safeEqual is exported from auth module", () => {
    expect(typeof authModule.safeEqual).toBe("function");
  });

  it("createHooksRequestHandler uses safeEqual for token validation", async () => {
    const safeEqualSpy = vi.spyOn(authModule, "safeEqual");

    const handler = createHooksRequestHandler({
      getHooksConfig: () => ({
        basePath: "/hooks",
        token: "secret-token",
        maxBodyBytes: 1024,
        mappings: [],
      }),
      bindHost: "127.0.0.1",
      port: 3000,
      logHooks: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } as never,
      dispatchWakeHook: vi.fn(),
      dispatchAgentHook: vi.fn(),
    });

    const req = {
      url: "/hooks/wake",
      method: "POST",
      headers: { authorization: "Bearer wrong-token" },
    } as unknown as IncomingMessage;

    const res = {
      statusCode: 0,
      setHeader: vi.fn(),
      end: vi.fn(),
    } as unknown as ServerResponse;

    await handler(req, res);

    // Verify safeEqual was called with the provided token and configured token
    expect(safeEqualSpy).toHaveBeenCalledWith("wrong-token", "secret-token");
    expect(res.statusCode).toBe(401);

    safeEqualSpy.mockRestore();
  });

  it("safeEqual returns true for equal strings", () => {
    expect(authModule.safeEqual("secret-token", "secret-token")).toBe(true);
    expect(authModule.safeEqual("", "")).toBe(true);
    expect(authModule.safeEqual("a", "a")).toBe(true);
  });

  it("safeEqual returns false for different strings of same length", () => {
    expect(authModule.safeEqual("secret-token", "secret-tokex")).toBe(false);
    expect(authModule.safeEqual("aaaa", "aaab")).toBe(false);
    expect(authModule.safeEqual("a", "b")).toBe(false);
  });

  it("safeEqual returns false for different lengths", () => {
    // The function checks length first, then does timing-safe comparison
    // This is safe because length is already leaked by HTTP response size anyway
    expect(authModule.safeEqual("short", "longer-string")).toBe(false);
    expect(authModule.safeEqual("longer-string", "short")).toBe(false);
    expect(authModule.safeEqual("", "nonempty")).toBe(false);
    expect(authModule.safeEqual("nonempty", "")).toBe(false);
  });

  it("safeEqual handles typical token formats", () => {
    // Tokens are typically ASCII alphanumeric + base64 characters
    const token1 = "abc123XYZ-_=";
    const token2 = "abc123XYZ-_=";
    const token3 = "abc123XYZ-_!";
    expect(authModule.safeEqual(token1, token2)).toBe(true);
    expect(authModule.safeEqual(token1, token3)).toBe(false);

    // UUID-style tokens
    const uuid1 = "550e8400-e29b-41d4-a716-446655440000";
    const uuid2 = "550e8400-e29b-41d4-a716-446655440000";
    const uuid3 = "550e8400-e29b-41d4-a716-446655440001";
    expect(authModule.safeEqual(uuid1, uuid2)).toBe(true);
    expect(authModule.safeEqual(uuid1, uuid3)).toBe(false);
  });
});
