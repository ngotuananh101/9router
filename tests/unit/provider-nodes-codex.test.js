import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { compatibleNodeToProviderSpecificData } from "@/lib/providerNormalization.js";

const originalDataDir = process.env.DATA_DIR;

const CODEX_HEADERS = {
  originator: "codex_cli_rs",
  "User-Agent": "codex_cli_rs/0.167.1",
  version: "0.167.1",
};

describe("compatibleNodeToProviderSpecificData with Codex fields", () => {
  it("carries codexFingerprint and the preset headers from the node", () => {
    const data = compatibleNodeToProviderSpecificData({
      prefix: "cx",
      baseUrl: "https://gw.example/v1",
      name: "Codex Node",
      codexFingerprint: true,
      customHeaders: CODEX_HEADERS,
    });

    expect(data.codexFingerprint).toBe(true);
    expect(data.customHeaders).toEqual(CODEX_HEADERS);
  });

  it("defaults codexFingerprint to false and customHeaders to {} when the node has none", () => {
    const data = compatibleNodeToProviderSpecificData({
      prefix: "cx",
      baseUrl: "https://gw.example/v1",
      name: "Plain Node",
    });

    expect(data.codexFingerprint).toBe(false);
    expect(data.customHeaders).toEqual({});
  });
});

describe("POST /api/provider-nodes with Codex fields", () => {
  let cleanup = () => {};

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.doUnmock("next/server");
    vi.resetModules();
    vi.clearAllMocks();
    cleanup();
    cleanup = () => {};
    if (originalDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = originalDataDir;
  });

  async function setupPostContext() {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-node-post-cx-"));
    process.env.DATA_DIR = tempDir;
    vi.resetModules();
    vi.doMock("next/server", () => ({
      NextResponse: {
        json(body, init = {}) {
          return new Response(JSON.stringify(body), {
            status: init.status || 200,
            headers: { "Content-Type": "application/json" },
          });
        },
      },
    }));
    const { POST, GET } = await import("@/app/api/provider-nodes/route.js");
    return {
      POST,
      GET,
      cleanup() {
        fs.rmSync(tempDir, { recursive: true, force: true });
      },
    };
  }

  function makePostRequest(body) {
    return new Request("https://9router.local/api/provider-nodes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("stores codexFingerprint and the preset headers on an openai-compatible node", async () => {
    const ctx = await setupPostContext();
    cleanup = ctx.cleanup;

    const response = await ctx.POST(
      makePostRequest({
        name: "Codex Post Node",
        prefix: "cxp",
        type: "openai-compatible",
        apiType: "responses",
        baseUrl: "https://gw.example/v1",
        codexFingerprint: true,
        customHeaders: CODEX_HEADERS,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.node.codexFingerprint).toBe(true);
    expect(body.node.customHeaders).toEqual(CODEX_HEADERS);

    const list = await (await ctx.GET()).json();
    const stored = list.nodes.find((n) => n.id === body.node.id);
    expect(stored.codexFingerprint).toBe(true);
    expect(stored.customHeaders).toEqual(CODEX_HEADERS);
  });

  it("defaults codexFingerprint to false and customHeaders to {} when the flag is off", async () => {
    const ctx = await setupPostContext();
    cleanup = ctx.cleanup;

    const response = await ctx.POST(
      makePostRequest({
        name: "Plain Post Node",
        prefix: "cxq",
        type: "openai-compatible",
        apiType: "responses",
        baseUrl: "https://gw.example/v1",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.node.codexFingerprint).toBe(false);
    expect(body.node.customHeaders).toEqual({});
  });
});
