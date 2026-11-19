import { describe, it, expect } from "vitest";
import {
  CLAUDE_CLI_SPOOF_HEADERS,
  getClaudeFingerprintDefaults,
} from "../../open-sse/providers/shared.js";

describe("getClaudeFingerprintDefaults", () => {
  it("returns the AgentRouter preset: urlSuffix, authHeader and the fourteen spoof headers", () => {
    const defaults = getClaudeFingerprintDefaults();

    expect(defaults.urlSuffix).toBe("?beta=true");
    expect(defaults.authHeader).toBe("x-api-key");
    expect(Object.keys(defaults.customHeaders).sort()).toEqual(
      Object.keys(CLAUDE_CLI_SPOOF_HEADERS).sort(),
    );
    expect(Object.keys(defaults.customHeaders)).toHaveLength(14);
    expect(defaults.customHeaders).toEqual(CLAUDE_CLI_SPOOF_HEADERS);
    expect(defaults.customHeaders["User-Agent"].startsWith("claude-cli/")).toBe(true);
  });

  it("returns a fresh object on every call", () => {
    const first = getClaudeFingerprintDefaults();
    const second = getClaudeFingerprintDefaults();

    expect(first).not.toBe(second);
    expect(first.customHeaders).not.toBe(second.customHeaders);
    first.customHeaders["X-App"] = "mutated";
    expect(second.customHeaders["X-App"]).toBe("cli");
    expect(CLAUDE_CLI_SPOOF_HEADERS["X-App"]).toBe("cli");
  });
});
