import { describe, expect, it } from "vitest";
import { applyMergePatch, stripProtectedGatewayPaths } from "./merge-patch.js";

describe("applyMergePatch", () => {
  it("merges flat keys", () => {
    expect(applyMergePatch({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 });
  });

  it("overwrites existing keys", () => {
    expect(applyMergePatch({ a: 1 }, { a: 2 })).toEqual({ a: 2 });
  });

  it("deletes keys set to null", () => {
    expect(applyMergePatch({ a: 1, b: 2 }, { a: null })).toEqual({ b: 2 });
  });

  it("deep merges nested objects", () => {
    const base = { gateway: { mode: "local", port: 18789 } };
    const patch = { gateway: { port: 9999 } };
    expect(applyMergePatch(base, patch)).toEqual({ gateway: { mode: "local", port: 9999 } });
  });

  it("replaces non-object base with patch", () => {
    expect(applyMergePatch("string", { a: 1 })).toEqual({ a: 1 });
  });
});

describe("stripProtectedGatewayPaths", () => {
  it("strips gateway.mode from patch", () => {
    const patch = { gateway: { mode: "remote" }, channels: { telegram: { botToken: "t" } } };
    const { cleaned, stripped } = stripProtectedGatewayPaths(patch);
    expect(stripped).toEqual(["gateway.mode"]);
    expect(cleaned).toEqual({ channels: { telegram: { botToken: "t" } } });
  });

  it("strips gateway.remote from patch", () => {
    const patch = { gateway: { remote: { sshTarget: "user@host", url: "ws://host:18789" } } };
    const { cleaned, stripped } = stripProtectedGatewayPaths(patch);
    expect(stripped).toEqual(["gateway.remote"]);
    expect(cleaned).toEqual({});
  });

  it("strips gateway.bind and gateway.port from patch", () => {
    const patch = { gateway: { bind: "0.0.0.0", port: 9999 } };
    const { cleaned, stripped } = stripProtectedGatewayPaths(patch);
    expect(stripped).toContain("gateway.bind");
    expect(stripped).toContain("gateway.port");
    expect(cleaned).toEqual({});
  });

  it("strips multiple protected keys at once", () => {
    const patch = {
      gateway: {
        mode: "remote",
        remote: { url: "ws://host:18789" },
        auth: { mode: "token", token: "abc" },
      },
    };
    const { cleaned, stripped } = stripProtectedGatewayPaths(patch);
    expect(stripped).toEqual(["gateway.mode", "gateway.remote"]);
    expect(cleaned).toEqual({ gateway: { auth: { mode: "token", token: "abc" } } });
  });

  it("passes through patches without gateway keys", () => {
    const patch = { channels: { telegram: { botToken: "t" } } };
    const { cleaned, stripped } = stripProtectedGatewayPaths(patch);
    expect(stripped).toEqual([]);
    expect(cleaned).toBe(patch);
  });

  it("passes through patches with only non-protected gateway keys", () => {
    const patch = { gateway: { auth: { mode: "token", token: "xyz" } } };
    const { cleaned, stripped } = stripProtectedGatewayPaths(patch);
    expect(stripped).toEqual([]);
    expect(cleaned).toBe(patch);
  });

  it("handles non-object patch gracefully", () => {
    const { cleaned, stripped } = stripProtectedGatewayPaths("not an object");
    expect(stripped).toEqual([]);
    expect(cleaned).toBe("not an object");
  });

  it("handles non-object gateway value gracefully", () => {
    const patch = { gateway: "invalid" };
    const { cleaned, stripped } = stripProtectedGatewayPaths(patch);
    expect(stripped).toEqual([]);
    expect(cleaned).toBe(patch);
  });
});
