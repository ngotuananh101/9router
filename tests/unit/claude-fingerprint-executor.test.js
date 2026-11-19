import { describe, it, expect, vi, beforeEach } from "vitest";

describe("DefaultExecutor with Claude fingerprint on anthropic-compatible nodes", () => {
  let DefaultExecutor;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import("open-sse/executors/default.js");
    DefaultExecutor = mod.DefaultExecutor || mod.default;
  });

  function fingerprintedCredentials(overrides = {}) {
    return {
      apiKey: "test-key",
      providerSpecificData: {
        baseUrl: "https://agentrouter.org/v1",
        claudeFingerprint: true,
        urlSuffix: "?beta=true",
        authHeader: "x-api-key",
        customHeaders: {
          "X-App": "cli",
          "Anthropic-Dangerous-Direct-Browser-Access": "true",
          "User-Agent": "claude-cli/2.1.322 (external, sdk-cli)",
          "x-api-key": "stolen",
          Authorization: "Bearer stolen",
        },
        ...overrides,
      },
    };
  }

  it("keeps the fingerprint headers instead of stripping them", () => {
    const executor = new DefaultExecutor("anthropic-compatible-custom");
    const headers = executor.buildHeaders(
      fingerprintedCredentials(),
      true,
      undefined,
      "claude-sonnet-4-5",
    );

    expect(headers["X-App"]).toBe("cli");
    expect(headers["Anthropic-Dangerous-Direct-Browser-Access"]).toBe("true");
    expect(headers["User-Agent"]).toBe("claude-cli/2.1.322 (external, sdk-cli)");
    expect(headers["Anthropic-Beta"]).toContain("claude-code-20250219");
  });

  it("never lets custom headers override auth", () => {
    const executor = new DefaultExecutor("anthropic-compatible-custom");
    const headers = executor.buildHeaders(
      fingerprintedCredentials(),
      true,
      undefined,
      "claude-sonnet-4-5",
    );

    expect(headers["x-api-key"]).toBe("test-key");
    expect(headers["Authorization"]).toBe("Bearer test-key");
  });

  it("sends Bearer only and no x-api-key when authHeader is bearer", () => {
    const executor = new DefaultExecutor("anthropic-compatible-custom");
    const headers = executor.buildHeaders(
      fingerprintedCredentials({ authHeader: "bearer" }),
      true,
      undefined,
      "claude-sonnet-4-5",
    );

    expect(headers["Authorization"]).toBe("Bearer test-key");
    expect(headers["x-api-key"]).toBeUndefined();
    expect(headers["X-App"]).toBe("cli");
  });

  it("appends urlSuffix after /messages in buildUrl", () => {
    const executor = new DefaultExecutor("anthropic-compatible-custom");
    const url = executor.buildUrl("claude-sonnet-4-5", true, 0, {
      providerSpecificData: {
        baseUrl: "https://agentrouter.org/v1",
        urlSuffix: "?beta=true",
      },
    });

    expect(url).toBe("https://agentrouter.org/v1/messages?beta=true");
  });

  it("buildUrl without urlSuffix is unchanged", () => {
    const executor = new DefaultExecutor("anthropic-compatible-custom");
    const url = executor.buildUrl("claude-sonnet-4-5", true, 0, {
      providerSpecificData: { baseUrl: "https://agentrouter.org/v1" },
    });

    expect(url).toBe("https://agentrouter.org/v1/messages");
  });

  it("still strips identity headers when the fingerprint flag is absent", () => {
    const executor = new DefaultExecutor("anthropic-compatible-custom");
    const headers = executor.buildHeaders(
      {
        apiKey: "key",
        providerSpecificData: { baseUrl: "https://myproxy.example.com/v1" },
      },
      true,
      undefined,
      "claude-opus-5",
    );

    expect(headers["X-App"]).toBeUndefined();
    const betaVal = headers["Anthropic-Beta"] || headers["anthropic-beta"] || "";
    expect(betaVal).not.toContain("claude-code-20250219");
  });
});
