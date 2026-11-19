import { describe, it, expect, vi } from "vitest";
import {
  CODEX_CLI_VERSION,
  getCodexFingerprintDefaults,
} from "../../open-sse/providers/shared.js";

describe("getCodexFingerprintDefaults", () => {
  it("returns the Codex CLI identity headers", () => {
    const defaults = getCodexFingerprintDefaults();

    expect(Object.keys(defaults.customHeaders).sort()).toEqual([
      "User-Agent",
      "originator",
      "version",
    ]);
    expect(defaults.customHeaders).toEqual({
      originator: "codex_cli_rs",
      "User-Agent": `codex_cli_rs/${CODEX_CLI_VERSION}`,
      version: CODEX_CLI_VERSION,
    });
  });

  it("returns a fresh object on every call", () => {
    const first = getCodexFingerprintDefaults();
    const second = getCodexFingerprintDefaults();

    expect(first).not.toBe(second);
    expect(first.customHeaders).not.toBe(second.customHeaders);
    first.customHeaders["User-Agent"] = "mutated";
    expect(second.customHeaders["User-Agent"]).toBe(
      `codex_cli_rs/${CODEX_CLI_VERSION}`,
    );
  });

  it("GET /api/provider-nodes/codex-fingerprint-defaults returns the defaults", async () => {
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
    const { GET } = await import(
      "@/app/api/provider-nodes/codex-fingerprint-defaults/route.js"
    );

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(getCodexFingerprintDefaults());
  });
});
