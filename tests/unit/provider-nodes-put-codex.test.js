import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const originalDataDir = process.env.DATA_DIR;

const CODEX_HEADERS = {
  originator: "codex_cli_rs",
  "User-Agent": "codex_cli_rs/0.167.1",
  version: "0.167.1",
};

async function setupTestContext(nodeData) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-node-put-cx-"));
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

  const { PUT } = await import("@/app/api/provider-nodes/[id]/route.js");
  const { POST: createConnection } = await import("@/app/api/providers/route.js");
  const { createProviderNode, getProviderConnections } = await import("@/models/index.js");

  const node = await createProviderNode(nodeData);

  return {
    node,
    PUT,
    createConnection,
    getProviderConnections,
    cleanup() {
      fs.rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

function makePutRequest(nodeId, body) {
  return new Request(`https://9router.local/api/provider-nodes/${nodeId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeConnectionRequest(provider, name) {
  return new Request("https://9router.local/api/providers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider,
      apiKey: "test-key",
      name,
      defaultModel: "test-model",
    }),
  });
}

describe("PUT /api/provider-nodes/[id] with Codex fingerprint fields", () => {
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

  it("syncs edited Codex fields to all existing connections", async () => {
    const ctx = await setupTestContext({
      id: "openai-compatible-responses-put-sync",
      type: "openai-compatible",
      name: "Put Sync Node",
      prefix: "psn",
      apiType: "responses",
      baseUrl: "https://gw.example/v1",
    });
    cleanup = ctx.cleanup;

    const first = await ctx.createConnection(makeConnectionRequest(ctx.node.id, "Key A"));
    const second = await ctx.createConnection(makeConnectionRequest(ctx.node.id, "Key B"));
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    const response = await ctx.PUT(
      makePutRequest(ctx.node.id, {
        name: "Put Sync Node",
        prefix: "psn",
        apiType: "responses",
        baseUrl: "https://gw.example/v1",
        codexFingerprint: true,
        customHeaders: CODEX_HEADERS,
      }),
      { params: Promise.resolve({ id: ctx.node.id }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.node.codexFingerprint).toBe(true);
    expect(body.node.customHeaders).toEqual(CODEX_HEADERS);

    const stored = await ctx.getProviderConnections({ provider: ctx.node.id });
    expect(stored).toHaveLength(2);
    for (const connection of stored) {
      expect(connection.providerSpecificData).toMatchObject({
        codexFingerprint: true,
        customHeaders: CODEX_HEADERS,
      });
    }
  });

  it("keeps stored Codex fields when the PUT body omits them", async () => {
    const ctx = await setupTestContext({
      id: "openai-compatible-responses-put-keep",
      type: "openai-compatible",
      name: "Put Keep Node",
      prefix: "pkp",
      apiType: "responses",
      baseUrl: "https://gw.example/v1",
      codexFingerprint: true,
      customHeaders: CODEX_HEADERS,
    });
    cleanup = ctx.cleanup;

    const created = await ctx.createConnection(makeConnectionRequest(ctx.node.id, "Key A"));
    expect(created.status).toBe(201);

    const response = await ctx.PUT(
      makePutRequest(ctx.node.id, {
        name: "Put Keep Node",
        prefix: "pkp",
        apiType: "responses",
        baseUrl: "https://gw.example/v1",
      }),
      { params: Promise.resolve({ id: ctx.node.id }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.node.codexFingerprint).toBe(true);
    expect(body.node.customHeaders).toEqual(CODEX_HEADERS);

    const stored = await ctx.getProviderConnections({ provider: ctx.node.id });
    expect(stored).toHaveLength(1);
    expect(stored[0].providerSpecificData).toMatchObject({
      codexFingerprint: true,
      customHeaders: CODEX_HEADERS,
    });
  });

  it("clears the flag when the PUT body sends codexFingerprint false", async () => {
    const ctx = await setupTestContext({
      id: "openai-compatible-responses-put-clear",
      type: "openai-compatible",
      name: "Put Clear Node",
      prefix: "pcl",
      apiType: "responses",
      baseUrl: "https://gw.example/v1",
      codexFingerprint: true,
      customHeaders: CODEX_HEADERS,
    });
    cleanup = ctx.cleanup;

    const created = await ctx.createConnection(makeConnectionRequest(ctx.node.id, "Key A"));
    expect(created.status).toBe(201);

    const response = await ctx.PUT(
      makePutRequest(ctx.node.id, {
        name: "Put Clear Node",
        prefix: "pcl",
        apiType: "responses",
        baseUrl: "https://gw.example/v1",
        codexFingerprint: false,
      }),
      { params: Promise.resolve({ id: ctx.node.id }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.node.codexFingerprint).toBe(false);

    const stored = await ctx.getProviderConnections({ provider: ctx.node.id });
    expect(stored).toHaveLength(1);
    expect(stored[0].providerSpecificData.codexFingerprint).toBe(false);
  });

  it("ignores the Codex flag on a non-openai node", async () => {
    const ctx = await setupTestContext({
      id: "anthropic-compatible-put-ignore-cx",
      type: "anthropic-compatible",
      name: "Put Ignore Node",
      prefix: "pin",
      baseUrl: "https://agentrouter.org/v1",
    });
    cleanup = ctx.cleanup;

    const created = await ctx.createConnection(makeConnectionRequest(ctx.node.id, "Key A"));
    expect(created.status).toBe(201);

    const response = await ctx.PUT(
      makePutRequest(ctx.node.id, {
        name: "Put Ignore Node",
        prefix: "pin",
        baseUrl: "https://agentrouter.org/v1",
        codexFingerprint: true,
        customHeaders: CODEX_HEADERS,
      }),
      { params: Promise.resolve({ id: ctx.node.id }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.node.codexFingerprint).toBeUndefined();

    const stored = await ctx.getProviderConnections({ provider: ctx.node.id });
    expect(stored).toHaveLength(1);
    expect(stored[0].providerSpecificData.codexFingerprint).toBeFalsy();
  });
});
