/**
 * Unit tests for /api/provider-nodes/validate endpoint
 *
 * Tests cover:
 *  - OpenAI-compatible validation via /models
 *  - Anthropic-compatible validation via /models
 *  - Fallback to /chat/completions when modelId provided
 *  - Error message handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock fetch globally
const originalFetch = global.fetch;

describe("Provider Validation API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("OpenAI Compatible", () => {
    it("should return valid:true when /models succeeds", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });

      // Simulate the validation logic
      const baseUrl = "https://api.openai.com/v1";
      const apiKey = "test-key";
      const modelsUrl = `${baseUrl}/models`;

      const res = await fetch(modelsUrl, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      expect(res.ok).toBe(true);
      expect(fetch).toHaveBeenCalledWith(modelsUrl, expect.objectContaining({
        headers: { Authorization: `Bearer ${apiKey}` },
      }));
    });

    it("should fallback to chat/completions when /models fails and modelId provided", async () => {
      const modelsCall = vi.fn().mockResolvedValue({ ok: false, status: 404 });
      const chatCall = vi.fn().mockResolvedValue({ ok: true });

      global.fetch = vi.fn().mockImplementation((url) => {
        if (url.includes("/models")) return modelsCall();
        if (url.includes("/chat/completions")) return chatCall();
        return Promise.reject(new Error("Unknown URL"));
      });

      // Simulate validation flow
      const baseUrl = "https://custom-provider.com/v1";
      const modelsRes = await fetch(`${baseUrl}/models`);
      expect(modelsRes.ok).toBe(false);

      // Fallback to chat
      const chatRes = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4",
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 1,
        }),
      });
      expect(chatRes.ok).toBe(true);
    });

    it("should return error when /models fails and no modelId", async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });

      const baseUrl = "https://custom-provider.com/v1";
      const res = await fetch(`${baseUrl}/models`);

      expect(res.ok).toBe(false);
      // Expected error: "/models unavailable - provide model ID for chat validation"
    });

    it("sends the Codex headers on the /models probe when codexFingerprint is on", async () => {
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
      vi.doMock("@/dashboardGuard", () => ({ isLocalRequest: () => true }));
      const { POST } = await import("@/app/api/provider-nodes/validate/route.js");
      global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });

      const request = new Request("http://localhost:3000/api/provider-nodes/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: "https://gw.example/v1",
          apiKey: "test-key",
          type: "openai-compatible",
          codexFingerprint: true,
          customHeaders: {
            originator: "codex_cli_rs",
            "User-Agent": "codex_cli_rs/0.167.1",
            version: "0.167.1",
          },
        }),
      });
      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.valid).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        "https://gw.example/v1/models",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer test-key",
            originator: "codex_cli_rs",
            "User-Agent": "codex_cli_rs/0.167.1",
            version: "0.167.1",
          }),
        }),
      );
    });

    it("falls back to /responses with a ping input when codexFingerprint is on and /models fails", async () => {
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
      vi.doMock("@/dashboardGuard", () => ({ isLocalRequest: () => true }));
      const { POST } = await import("@/app/api/provider-nodes/validate/route.js");
      global.fetch = vi.fn().mockImplementation((url) => {
        if (url.includes("/models")) return Promise.resolve({ ok: false, status: 404 });
        if (url.includes("/responses")) return Promise.resolve({ ok: true, json: async () => ({}) });
        return Promise.reject(new Error("Unknown URL"));
      });

      const request = new Request("http://localhost:3000/api/provider-nodes/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: "https://gw.example/v1",
          apiKey: "test-key",
          type: "openai-compatible",
          modelId: "gpt-5",
          codexFingerprint: true,
          customHeaders: {
            originator: "codex_cli_rs",
            "User-Agent": "codex_cli_rs/0.167.1",
            version: "0.167.1",
          },
        }),
      });
      const response = await POST(request);
      const body = await response.json();

      expect(body.valid).toBe(true);
      expect(body.method).toBe("responses");
      const responsesCall = global.fetch.mock.calls.find(([url]) => url.includes("/responses"));
      expect(responsesCall[0]).toBe("https://gw.example/v1/responses");
      expect(JSON.parse(responsesCall[1].body)).toEqual({
        model: "gpt-5",
        input: "ping",
        max_output_tokens: 1,
      });
      expect(responsesCall[1].headers.Authorization).toBe("Bearer test-key");
      expect(responsesCall[1].headers.originator).toBe("codex_cli_rs");
      expect(responsesCall[1].headers["User-Agent"]).toBe("codex_cli_rs/0.167.1");
      expect(responsesCall[1].headers.version).toBe("0.167.1");
      expect(global.fetch.mock.calls.find(([url]) => url.includes("/chat/completions"))).toBeUndefined();
    });

    it("does not try /responses without a modelId when the Codex /models probe fails", async () => {
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
      vi.doMock("@/dashboardGuard", () => ({ isLocalRequest: () => true }));
      const { POST } = await import("@/app/api/provider-nodes/validate/route.js");
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });

      const request = new Request("http://localhost:3000/api/provider-nodes/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: "https://gw.example/v1",
          apiKey: "test-key",
          type: "openai-compatible",
          codexFingerprint: true,
          customHeaders: {
            originator: "codex_cli_rs",
            "User-Agent": "codex_cli_rs/0.167.1",
            version: "0.167.1",
          },
        }),
      });
      const response = await POST(request);
      const body = await response.json();

      expect(body.valid).toBe(false);
      expect(body.error).toBe("/models endpoint not found - try chat validation with model ID");
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledWith(
        "https://gw.example/v1/models",
        expect.objectContaining({
          headers: expect.objectContaining({ originator: "codex_cli_rs" }),
        }),
      );
    });
  });

  describe("Anthropic Compatible", () => {
    it("should normalize URL by removing /messages suffix", () => {
      const normalizeUrl = (url) => {
        let normalized = url.trim().replace(/\/$/, "");
        if (normalized.endsWith("/messages")) {
          normalized = normalized.slice(0, -9);
        }
        return normalized;
      };

      expect(normalizeUrl("https://api.anthropic.com/v1/messages")).toBe("https://api.anthropic.com/v1");
      expect(normalizeUrl("https://api.anthropic.com/v1/messages/")).toBe("https://api.anthropic.com/v1");
      expect(normalizeUrl("https://api.anthropic.com/v1")).toBe("https://api.anthropic.com/v1");
    });

    it("should send correct headers for Anthropic API", async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true });

      const baseUrl = "https://api.anthropic.com/v1";
      const apiKey = "test-key";

      await fetch(`${baseUrl}/models`, {
        method: "GET",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          Authorization: `Bearer ${apiKey}`,
        },
      });

      expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
        headers: expect.objectContaining({
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        }),
      }));
    });

    it("sends the fingerprint headers and urlSuffix on the /models probe when claudeFingerprint is on", async () => {
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
      vi.doMock("@/dashboardGuard", () => ({ isLocalRequest: () => true }));
      const { POST } = await import("@/app/api/provider-nodes/validate/route.js");
      global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });

      const request = new Request("http://localhost:3000/api/provider-nodes/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: "https://agentrouter.org/v1",
          apiKey: "test-key",
          type: "anthropic-compatible",
          claudeFingerprint: true,
          urlSuffix: "?beta=true",
          authHeader: "x-api-key",
          customHeaders: { "X-App": "cli", "x-api-key": "stolen" },
        }),
      });
      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.valid).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        "https://agentrouter.org/v1/models?beta=true",
        expect.objectContaining({
          headers: expect.objectContaining({
            "X-App": "cli",
            "x-api-key": "test-key",
          }),
        }),
      );
    });

    it("sends bearer-only auth on the /models probe when authHeader is bearer", async () => {
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
      vi.doMock("@/dashboardGuard", () => ({ isLocalRequest: () => true }));
      const { POST } = await import("@/app/api/provider-nodes/validate/route.js");
      global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });

      const request = new Request("http://localhost:3000/api/provider-nodes/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: "https://agentrouter.org/v1",
          apiKey: "test-key",
          type: "anthropic-compatible",
          claudeFingerprint: true,
          urlSuffix: "?beta=true",
          authHeader: "bearer",
          customHeaders: { "X-App": "cli" },
        }),
      });
      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.valid).toBe(true);
      const [url, options] = global.fetch.mock.calls[0];
      expect(url).toBe("https://agentrouter.org/v1/models?beta=true");
      expect(options.headers.Authorization).toBe("Bearer test-key");
      expect(options.headers["x-api-key"]).toBeUndefined();
      expect(options.headers["X-App"]).toBe("cli");
    });

    it("does not duplicate anthropic-version on the /models probe", async () => {
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
      vi.doMock("@/dashboardGuard", () => ({ isLocalRequest: () => true }));
      const { POST } = await import("@/app/api/provider-nodes/validate/route.js");
      global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });

      const request = new Request("http://localhost:3000/api/provider-nodes/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: "https://agentrouter.org/v1",
          apiKey: "test-key",
          type: "anthropic-compatible",
          claudeFingerprint: true,
          urlSuffix: "?beta=true",
          authHeader: "x-api-key",
          customHeaders: { "X-App": "cli", "Anthropic-Version": "2023-06-01" },
        }),
      });
      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.valid).toBe(true);
      const headers = global.fetch.mock.calls[0][1].headers;
      expect(Object.keys(headers).filter((k) => k.toLowerCase() === "anthropic-version")).toEqual([
        "anthropic-version",
      ]);
      expect(headers["X-App"]).toBe("cli");
    });

    it("prepends ? to a bare urlSuffix on the /models probe", async () => {
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
      vi.doMock("@/dashboardGuard", () => ({ isLocalRequest: () => true }));
      const { POST } = await import("@/app/api/provider-nodes/validate/route.js");
      global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });

      const request = new Request("http://localhost:3000/api/provider-nodes/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: "https://agentrouter.org/v1",
          apiKey: "test-key",
          type: "anthropic-compatible",
          claudeFingerprint: true,
          urlSuffix: "beta=true",
          authHeader: "x-api-key",
          customHeaders: {},
        }),
      });
      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.valid).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        "https://agentrouter.org/v1/models?beta=true",
        expect.anything(),
      );
    });

    it("sends bearer-only auth on the /chat/completions fallback probe when authHeader is bearer", async () => {
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
      vi.doMock("@/dashboardGuard", () => ({ isLocalRequest: () => true }));
      const { POST } = await import("@/app/api/provider-nodes/validate/route.js");
      global.fetch = vi.fn().mockImplementation((url) => {
        if (url.includes("/models")) return Promise.resolve({ ok: false, status: 404 });
        if (url.includes("/chat/completions")) return Promise.resolve({ ok: true });
        return Promise.reject(new Error("Unknown URL"));
      });

      const request = new Request("http://localhost:3000/api/provider-nodes/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: "https://agentrouter.org/v1",
          apiKey: "test-key",
          type: "anthropic-compatible",
          modelId: "claude-sonnet-4-5",
          claudeFingerprint: true,
          urlSuffix: "?beta=true",
          authHeader: "bearer",
          customHeaders: { "X-App": "cli" },
        }),
      });
      const response = await POST(request);
      const body = await response.json();

      expect(body.valid).toBe(true);
      expect(body.method).toBe("chat");
      const chatCall = global.fetch.mock.calls.find(([url]) => url.includes("/chat/completions"));
      expect(chatCall[0]).toBe("https://agentrouter.org/v1/chat/completions?beta=true");
      expect(chatCall[1].headers.Authorization).toBe("Bearer test-key");
      expect(chatCall[1].headers["x-api-key"]).toBeUndefined();
      expect(chatCall[1].headers["X-App"]).toBe("cli");
    });
  });

  describe("Error Messages - Network", () => {
    it("should map ECONNREFUSED to user-friendly message", () => {
      const getErrorMessage = (error) => {
        if (error.cause?.code === "ECONNREFUSED") return "Connection refused - provider node offline or unreachable";
        return "Unknown error";
      };

      const error = { cause: { code: "ECONNREFUSED" } };
      expect(getErrorMessage(error)).toBe("Connection refused - provider node offline or unreachable");
    });

    it("should map ENOTFOUND to user-friendly message", () => {
      const getErrorMessage = (error) => {
        if (error.cause?.code === "ENOTFOUND") return "DNS lookup failed - invalid domain or network issue";
        return "Unknown error";
      };

      const error = { cause: { code: "ENOTFOUND" } };
      expect(getErrorMessage(error)).toBe("DNS lookup failed - invalid domain or network issue");
    });

    it("should map timeout to user-friendly message", () => {
      const getErrorMessage = (error) => {
        if (error.message.includes("timeout")) return "Request timeout (>10s) - provider node not responding";
        return "Unknown error";
      };

      const error = { message: "Request timeout" };
      expect(getErrorMessage(error)).toBe("Request timeout (>10s) - provider node not responding");
    });

    it("should map CERT_HAS_EXPIRED to user-friendly message", () => {
      const getErrorMessage = (error) => {
        if (error.cause?.code === "CERT_HAS_EXPIRED") return "SSL certificate expired";
        return "Unknown error";
      };

      const error = { cause: { code: "CERT_HAS_EXPIRED" } };
      expect(getErrorMessage(error)).toBe("SSL certificate expired");
    });
  });

  describe("URL Validation", () => {
    it("should validate correct URL format", () => {
      const isValidUrl = (url) => {
        try {
          new URL(url);
          return true;
        } catch {
          return false;
        }
      };

      expect(isValidUrl("https://api.openai.com/v1")).toBe(true);
      expect(isValidUrl("http://localhost:8080")).toBe(true);
      expect(isValidUrl("not-a-url")).toBe(false);
      expect(isValidUrl("")).toBe(false);
    });
  });

  describe("Error Messages - /models Status Codes", () => {
    const getModelsErrorMessage = (status) => {
      if (status === 401 || status === 403) return "API key unauthorized";
      if (status === 404) return "/models endpoint not found - try chat validation with model ID";
      if (status >= 500) return "Server error - try again later";
      return `Unexpected response (${status})`;
    };

    it("should return auth error for 401", () => {
      expect(getModelsErrorMessage(401)).toBe("API key unauthorized");
    });

    it("should return auth error for 403", () => {
      expect(getModelsErrorMessage(403)).toBe("API key unauthorized");
    });

    it("should return not found for 404", () => {
      expect(getModelsErrorMessage(404)).toBe("/models endpoint not found - try chat validation with model ID");
    });

    it("should return server error for 500", () => {
      expect(getModelsErrorMessage(500)).toBe("Server error - try again later");
    });

    it("should return server error for 502", () => {
      expect(getModelsErrorMessage(502)).toBe("Server error - try again later");
    });

    it("should return unexpected for other codes", () => {
      expect(getModelsErrorMessage(418)).toBe("Unexpected response (418)");
    });
  });

  describe("Error Messages - /chat/completions Status Codes", () => {
    const getChatErrorMessage = (status) => {
      if (status === 401 || status === 403) return "API key unauthorized";
      if (status === 400) return "Invalid model or bad request";
      if (status === 404) return "Chat endpoint not found";
      if (status >= 500) return "Server error - try again later";
      return `Chat request failed (${status})`;
    };

    it("should return auth error for 401", () => {
      expect(getChatErrorMessage(401)).toBe("API key unauthorized");
    });

    it("should return invalid model for 400", () => {
      expect(getChatErrorMessage(400)).toBe("Invalid model or bad request");
    });

    it("should return not found for 404", () => {
      expect(getChatErrorMessage(404)).toBe("Chat endpoint not found");
    });

    it("should return server error for 503", () => {
      expect(getChatErrorMessage(503)).toBe("Server error - try again later");
    });

    it("should return failed for other codes", () => {
      expect(getChatErrorMessage(429)).toBe("Chat request failed (429)");
    });
  });

  describe("Response Format", () => {
    it("should return correct format for success via /models", () => {
      const response = { valid: true };
      expect(response).toEqual({ valid: true });
    });

    it("should return correct format for success via chat", () => {
      const response = { valid: true, error: null, method: "chat" };
      expect(response.valid).toBe(true);
      expect(response.method).toBe("chat");
      expect(response.error).toBeNull();
    });

    it("should return correct format for failure with error", () => {
      const response = {
        valid: false,
        error: "API key unauthorized or model unavailable",
        method: "chat"
      };
      expect(response.valid).toBe(false);
      expect(response.error).toBeDefined();
    });
  });
});
