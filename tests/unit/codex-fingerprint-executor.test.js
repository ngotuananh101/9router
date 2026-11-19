import { describe, it, expect, vi, beforeEach } from "vitest";

describe("DefaultExecutor with Codex fingerprint on openai-compatible nodes", () => {
  let DefaultExecutor;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import("open-sse/executors/default.js");
    DefaultExecutor = mod.DefaultExecutor || mod.default;
  });

  function codexCredentials(overrides = {}) {
    return {
      apiKey: "test-key",
      providerSpecificData: {
        baseUrl: "https://gw.example/v1",
        apiType: "responses",
        codexFingerprint: true,
        customHeaders: {
          originator: "codex_cli_rs",
          "User-Agent": "codex_cli_rs/0.167.1",
          version: "0.167.1",
        },
        ...overrides,
      },
    };
  }

  it("merges stored Codex headers when the switch is on", () => {
    const executor = new DefaultExecutor("openai-compatible-responses-abc123");
    const headers = executor.buildHeaders(codexCredentials(), true, undefined, "gpt-5");

    expect(headers.originator).toBe("codex_cli_rs");
    expect(headers["User-Agent"]).toBe("codex_cli_rs/0.167.1");
    expect(headers.version).toBe("0.167.1");
    expect(headers.Authorization).toBe("Bearer test-key");
  });

  it("sends no Codex headers when the switch is off", () => {
    const executor = new DefaultExecutor("openai-compatible-responses-abc123");
    const headers = executor.buildHeaders(
      codexCredentials({ codexFingerprint: false }),
      true,
      undefined,
      "gpt-5",
    );

    expect(headers.originator).toBeUndefined();
    expect(headers["User-Agent"]).toBeUndefined();
    expect(headers.version).toBeUndefined();
  });

  it("never lets a stored Authorization header override the real key", () => {
    const executor = new DefaultExecutor("openai-compatible-responses-abc123");
    const headers = executor.buildHeaders(
      codexCredentials({
        customHeaders: {
          originator: "codex_cli_rs",
          Authorization: "Bearer fake",
        },
      }),
      true,
      undefined,
      "gpt-5",
    );

    expect(headers.Authorization).toBe("Bearer test-key");
    expect(headers.originator).toBe("codex_cli_rs");
  });

  it("skips non-string custom header values instead of breaking the request", () => {
    const executor = new DefaultExecutor("openai-compatible-responses-abc123");
    const headers = executor.buildHeaders(
      codexCredentials({
        customHeaders: {
          originator: "codex_cli_rs",
          version: 1,
        },
      }),
      true,
      undefined,
      "gpt-5",
    );

    expect(headers.originator).toBe("codex_cli_rs");
    expect(headers.version).toBeUndefined();
  });

  it("merges the headers for chat apiType too when the flag is on", () => {
    const executor = new DefaultExecutor("openai-compatible-chat-abc123");
    const headers = executor.buildHeaders(
      codexCredentials({ apiType: "chat" }),
      true,
      undefined,
      "gpt-5",
    );

    expect(headers.originator).toBe("codex_cli_rs");
    expect(headers["User-Agent"]).toBe("codex_cli_rs/0.167.1");
    expect(headers.version).toBe("0.167.1");
  });
});
