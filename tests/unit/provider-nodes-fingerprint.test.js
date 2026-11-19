import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

let tempDir;
const originalDataDir = process.env.DATA_DIR;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-node-fp-"));
  process.env.DATA_DIR = tempDir;
  delete global._dbAdapter;
  vi.resetModules();
});

afterEach(() => {
  try { global._dbAdapter?.instance?.close?.(); } catch {}
  delete global._dbAdapter;
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
});

describe("provider nodes with Claude fingerprint fields", () => {
  it("createProviderNode round-trips claudeFingerprint, urlSuffix, authHeader and customHeaders", async () => {
    const { createProviderNode, getProviderNodeById } = await import(
      "@/lib/db/repos/nodesRepo.js"
    );

    const node = await createProviderNode({
      id: "anthropic-compatible-test",
      type: "anthropic-compatible",
      name: "AgentRouter custom",
      prefix: "agentrouter",
      baseUrl: "https://agentrouter.org/v1",
      claudeFingerprint: true,
      urlSuffix: "?beta=true",
      authHeader: "x-api-key",
      customHeaders: {
        "X-App": "cli",
        "User-Agent": "claude-cli/2.1.322 (external, sdk-cli)",
      },
    });

    expect(node.claudeFingerprint).toBe(true);
    const found = await getProviderNodeById(node.id);
    expect(found.claudeFingerprint).toBe(true);
    expect(found.urlSuffix).toBe("?beta=true");
    expect(found.authHeader).toBe("x-api-key");
    expect(found.customHeaders).toEqual({
      "X-App": "cli",
      "User-Agent": "claude-cli/2.1.322 (external, sdk-cli)",
    });
    expect(found.prefix).toBe("agentrouter");
    expect(found.baseUrl).toBe("https://agentrouter.org/v1");
  });

  it("compatibleNodeToProviderSpecificData defaults the fingerprint fields for plain nodes", async () => {
    const { compatibleNodeToProviderSpecificData } = await import(
      "@/lib/providerNormalization.js"
    );

    const mapped = compatibleNodeToProviderSpecificData({
      name: "Plain",
      prefix: "plain",
      baseUrl: "https://example.com/v1",
    });

    expect(mapped).toEqual({
      prefix: "plain",
      baseUrl: "https://example.com/v1",
      nodeName: "Plain",
      claudeFingerprint: false,
      codexFingerprint: false,
      urlSuffix: "",
      authHeader: "x-api-key",
      customHeaders: {},
    });
  });

  it("compatibleNodeToProviderSpecificData keeps apiType when the node has one", async () => {
    const { compatibleNodeToProviderSpecificData } = await import(
      "@/lib/providerNormalization.js"
    );

    const mapped = compatibleNodeToProviderSpecificData({
      name: "OpenAI node",
      prefix: "oai",
      apiType: "chat",
      baseUrl: "https://api.openai.com/v1",
    });

    expect(mapped.apiType).toBe("chat");
    expect(mapped.claudeFingerprint).toBe(false);
  });

  it("compatibleNodeToProviderSpecificData carries the fingerprint fields when the node has them", async () => {
    const { compatibleNodeToProviderSpecificData } = await import(
      "@/lib/providerNormalization.js"
    );

    const mapped = compatibleNodeToProviderSpecificData({
      name: "AgentRouter custom",
      prefix: "agentrouter",
      baseUrl: "https://agentrouter.org/v1",
      claudeFingerprint: true,
      urlSuffix: "?beta=true",
      authHeader: "bearer",
      customHeaders: { "X-App": "cli" },
    });

    expect(mapped).toEqual({
      prefix: "agentrouter",
      baseUrl: "https://agentrouter.org/v1",
      nodeName: "AgentRouter custom",
      claudeFingerprint: true,
      codexFingerprint: false,
      urlSuffix: "?beta=true",
      authHeader: "bearer",
      customHeaders: { "X-App": "cli" },
    });
  });

  it("compatibleNodeToProviderSpecificData normalizes a bare urlSuffix", async () => {
    const { compatibleNodeToProviderSpecificData } = await import(
      "@/lib/providerNormalization.js"
    );

    expect(
      compatibleNodeToProviderSpecificData({
        name: "Bare",
        prefix: "bare",
        baseUrl: "https://example.com/v1",
        urlSuffix: "beta=true",
      }).urlSuffix,
    ).toBe("?beta=true");
    expect(
      compatibleNodeToProviderSpecificData({
        name: "Amp",
        prefix: "amp",
        baseUrl: "https://example.com/v1",
        urlSuffix: "&beta=true",
      }).urlSuffix,
    ).toBe("&beta=true");
    expect(
      compatibleNodeToProviderSpecificData({
        name: "Blank",
        prefix: "blank",
        baseUrl: "https://example.com/v1",
        urlSuffix: "   ",
      }).urlSuffix,
    ).toBe("");
  });

  it("compatibleNodeToProviderSpecificData drops non-string custom header values", async () => {
    const { compatibleNodeToProviderSpecificData } = await import(
      "@/lib/providerNormalization.js"
    );

    const mapped = compatibleNodeToProviderSpecificData({
      name: "Mixed",
      prefix: "mixed",
      baseUrl: "https://example.com/v1",
      customHeaders: { "X-App": "cli", "X-Count": 3, "X-Flag": true, "X-Null": null },
    });

    expect(mapped.customHeaders).toEqual({ "X-App": "cli" });
  });
});
