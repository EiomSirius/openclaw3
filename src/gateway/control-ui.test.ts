import type { IncomingMessage, ServerResponse } from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildControlUiAvatarUrl,
  normalizeControlUiBasePath,
  resolveAssistantAvatarUrl,
} from "./control-ui-shared.js";
import { handleControlUiHttpRequest } from "./control-ui.js";

describe("resolveAssistantAvatarUrl", () => {
  it("normalizes base paths", () => {
    expect(normalizeControlUiBasePath()).toBe("");
    expect(normalizeControlUiBasePath("")).toBe("");
    expect(normalizeControlUiBasePath(" ")).toBe("");
    expect(normalizeControlUiBasePath("/")).toBe("");
    expect(normalizeControlUiBasePath("ui")).toBe("/ui");
    expect(normalizeControlUiBasePath("/ui/")).toBe("/ui");
  });

  it("builds avatar URLs", () => {
    expect(buildControlUiAvatarUrl("", "main")).toBe("/avatar/main");
    expect(buildControlUiAvatarUrl("/ui", "main")).toBe("/ui/avatar/main");
  });

  it("keeps remote and data URLs", () => {
    expect(
      resolveAssistantAvatarUrl({
        avatar: "https://example.com/avatar.png",
        agentId: "main",
        basePath: "/ui",
      }),
    ).toBe("https://example.com/avatar.png");
    expect(
      resolveAssistantAvatarUrl({
        avatar: "data:image/png;base64,abc",
        agentId: "main",
        basePath: "/ui",
      }),
    ).toBe("data:image/png;base64,abc");
  });

  it("prefixes basePath for /avatar endpoints", () => {
    expect(
      resolveAssistantAvatarUrl({
        avatar: "/avatar/main",
        agentId: "main",
        basePath: "/ui",
      }),
    ).toBe("/ui/avatar/main");
    expect(
      resolveAssistantAvatarUrl({
        avatar: "/ui/avatar/main",
        agentId: "main",
        basePath: "/ui",
      }),
    ).toBe("/ui/avatar/main");
  });

  it("maps local avatar paths to the avatar endpoint", () => {
    expect(
      resolveAssistantAvatarUrl({
        avatar: "avatars/me.png",
        agentId: "main",
        basePath: "/ui",
      }),
    ).toBe("/ui/avatar/main");
    expect(
      resolveAssistantAvatarUrl({
        avatar: "avatars/profile",
        agentId: "main",
        basePath: "/ui",
      }),
    ).toBe("/ui/avatar/main");
  });

  it("leaves local paths untouched when agentId is missing", () => {
    expect(
      resolveAssistantAvatarUrl({
        avatar: "avatars/me.png",
        basePath: "/ui",
      }),
    ).toBe("avatars/me.png");
  });

  it("keeps short text avatars", () => {
    expect(
      resolveAssistantAvatarUrl({
        avatar: "PS",
        agentId: "main",
        basePath: "/ui",
      }),
    ).toBe("PS");
  });
});

// ---------------------------------------------------------------------------
// handleControlUiHttpRequest – SPA fallback vs /api/* routes
// ---------------------------------------------------------------------------

function mockReq(method: string, url: string): IncomingMessage {
  return { method, url, headers: {} } as unknown as IncomingMessage;
}

function mockRes(): ServerResponse & {
  _status: number;
  _headers: Record<string, string>;
  _body: string;
} {
  const res = {
    _status: 200,
    _headers: {} as Record<string, string>,
    _body: "",
    set statusCode(v: number) {
      this._status = v;
    },
    get statusCode() {
      return this._status;
    },
    setHeader(k: string, v: string) {
      this._headers[k.toLowerCase()] = v;
    },
    end(body?: string | Buffer) {
      if (body != null) this._body = typeof body === "string" ? body : body.toString("utf8");
    },
  } as unknown as ServerResponse & {
    _status: number;
    _headers: Record<string, string>;
    _body: string;
  };
  return res;
}

describe("handleControlUiHttpRequest – /api/ exclusion", () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-cui-test-"));
    fs.writeFileSync(path.join(tmpDir, "index.html"), "<html><body>SPA</body></html>", "utf8");
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const rootState = () => ({ kind: "resolved" as const, path: tmpDir });

  it("serves SPA fallback for normal unknown routes", () => {
    const req = mockReq("GET", "/some/page");
    const res = mockRes();
    const handled = handleControlUiHttpRequest(req, res, { root: rootState() });
    expect(handled).toBe(true);
    expect(res._status).toBe(200);
    expect(res._headers["content-type"]).toContain("text/html");
    expect(res._body).toContain("SPA");
  });

  it("returns JSON 404 for /api/ routes instead of SPA fallback", () => {
    const req = mockReq("GET", "/api/some-endpoint");
    const res = mockRes();
    const handled = handleControlUiHttpRequest(req, res, { root: rootState() });
    expect(handled).toBe(true);
    expect(res._status).toBe(404);
    expect(res._headers["content-type"]).toContain("application/json");
    expect(JSON.parse(res._body)).toEqual({ error: "Not found" });
  });

  it("returns JSON 404 for /api (no trailing slash)", () => {
    const req = mockReq("GET", "/api");
    const res = mockRes();
    const handled = handleControlUiHttpRequest(req, res, { root: rootState() });
    expect(handled).toBe(true);
    expect(res._status).toBe(404);
    expect(JSON.parse(res._body)).toEqual({ error: "Not found" });
  });

  it("returns JSON 404 for /api/ routes under a basePath", () => {
    const req = mockReq("GET", "/ui/api/foo");
    const res = mockRes();
    const handled = handleControlUiHttpRequest(req, res, {
      basePath: "/ui",
      root: rootState(),
    });
    expect(handled).toBe(true);
    expect(res._status).toBe(404);
    expect(res._headers["content-type"]).toContain("application/json");
    expect(JSON.parse(res._body)).toEqual({ error: "Not found" });
  });
});
