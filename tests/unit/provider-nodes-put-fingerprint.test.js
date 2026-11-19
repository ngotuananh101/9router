import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const originalDataDir = process.env.DATA_DIR;

async function setupTestContext(nodeData) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-node-put-fp-"));
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

describe("PUT /api/provider-nodes/[id] with Claude fingerprint fields", () => {
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

  it("syncs edited fingerprint fields to all existing connections", async () => {
    const ctx = await setupTestContext({
      id: "anthropic-compatible-put-sync",
      type: "anthropic-compatible",
      name: "Put Sync Node",
      prefix: "psn",
      baseUrl: "https://agentrouter.org/v1",
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
        baseUrl: "https://agentrouter.org/v1",
        claudeFingerprint: true,
        urlSuffix: "?beta=true",
        authHeader: "bearer",
        customHeaders: { "X-App": "cli" },
      }),
      { params: Promise.resolve({ id: ctx.node.id }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.node.claudeFingerprint).toBe(true);
    expect(body.node.urlSuffix).toBe("?beta=true");
    expect(body.node.authHeader).toBe("bearer");

    const stored = await ctx.getProviderConnections({ provider: ctx.node.id });
    expect(stored).toHaveLength(2);
    for (const connection of stored) {
      expect(connection.providerSpecificData).toMatchObject({
        claudeFingerprint: true,
        urlSuffix: "?beta=true",
        authHeader: "bearer",
        customHeaders: { "X-App": "cli" },
      });
    }
  });

  it("ignores fingerprint fields on a non-anthropic node", async () => {
    const ctx = await setupTestContext({
      id: "openai-compatible-put-ignore",
      type: "openai-compatible",
      name: "Put Ignore Node",
      prefix: "pin",
      apiType: "chat",
      baseUrl: "https://openai-compatible.test/v1",
    });
    cleanup = ctx.cleanup;

    const created = await ctx.createConnection(makeConnectionRequest(ctx.node.id, "Key A"));
    expect(created.status).toBe(201);

    const response = await ctx.PUT(
      makePutRequest(ctx.node.id, {
        name: "Put Ignore Node",
        prefix: "pin",
        baseUrl: "https://openai-compatible.test/v1",
        apiType: "chat",
        claudeFingerprint: true,
        urlSuffix: "?beta=true",
        authHeader: "bearer",
        customHeaders: { "X-App": "cli" },
      }),
      { params: Promise.resolve({ id: ctx.node.id }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.node.claudeFingerprint).toBeUndefined();
    expect(body.node.urlSuffix).toBeUndefined();

    const stored = await ctx.getProviderConnections({ provider: ctx.node.id });
    expect(stored).toHaveLength(1);
    expect(stored[0].providerSpecificData.claudeFingerprint).toBeUndefined();
    expect(stored[0].providerSpecificData.urlSuffix).toBeUndefined();
    expect(stored[0].providerSpecificData.customHeaders).toBeUndefined();
  });

  it("normalizes a bare urlSuffix on PUT", async () => {
    const ctx = await setupTestContext({
      id: "anthropic-compatible-put-suffix",
      type: "anthropic-compatible",
      name: "Put Suffix Node",
      prefix: "psx",
      baseUrl: "https://agentrouter.org/v1",
    });
    cleanup = ctx.cleanup;

    const response = await ctx.PUT(
      makePutRequest(ctx.node.id, {
        name: "Put Suffix Node",
        prefix: "psx",
        baseUrl: "https://agentrouter.org/v1",
        claudeFingerprint: true,
        urlSuffix: "beta=true",
      }),
      { params: Promise.resolve({ id: ctx.node.id }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.node.urlSuffix).toBe("?beta=true");
  });

  it("rejects an invalid authHeader with 400", async () => {
    const ctx = await setupTestContext({
      id: "anthropic-compatible-put-bad-auth",
      type: "anthropic-compatible",
      name: "Put Bad Auth Node",
      prefix: "pba",
      baseUrl: "https://agentrouter.org/v1",
    });
    cleanup = ctx.cleanup;

    const response = await ctx.PUT(
      makePutRequest(ctx.node.id, {
        name: "Put Bad Auth Node",
        prefix: "pba",
        baseUrl: "https://agentrouter.org/v1",
        authHeader: "basic",
      }),
      { params: Promise.resolve({ id: ctx.node.id }) },
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid auth header");
  });

  it("keeps stored fingerprint fields when the PUT body omits them", async () => {
    const ctx = await setupTestContext({
      id: "anthropic-compatible-put-keep",
      type: "anthropic-compatible",
      name: "Put Keep Node",
      prefix: "pkp",
      baseUrl: "https://agentrouter.org/v1",
      claudeFingerprint: true,
      urlSuffix: "?beta=true",
      authHeader: "bearer",
      customHeaders: { "X-App": "cli" },
    });
    cleanup = ctx.cleanup;

    const created = await ctx.createConnection(makeConnectionRequest(ctx.node.id, "Key A"));
    expect(created.status).toBe(201);

    const response = await ctx.PUT(
      makePutRequest(ctx.node.id, {
        name: "Put Keep Node",
        prefix: "pkp",
        baseUrl: "https://agentrouter.org/v1",
      }),
      { params: Promise.resolve({ id: ctx.node.id }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.node.claudeFingerprint).toBe(true);
    expect(body.node.urlSuffix).toBe("?beta=true");
    expect(body.node.authHeader).toBe("bearer");
    expect(body.node.customHeaders).toEqual({ "X-App": "cli" });

    const stored = await ctx.getProviderConnections({ provider: ctx.node.id });
    expect(stored).toHaveLength(1);
    expect(stored[0].providerSpecificData).toMatchObject({
      claudeFingerprint: true,
      urlSuffix: "?beta=true",
      authHeader: "bearer",
      customHeaders: { "X-App": "cli" },
    });
  });
});
