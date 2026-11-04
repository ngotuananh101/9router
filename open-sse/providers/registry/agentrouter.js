import { CLAUDE_CLI_SPOOF_HEADERS } from "../shared.js";

// AgentRouter (agentrouter.org) — Anthropic-compatible gateway.
// Unlike a UI custom "anthropic-compatible" node, this built-in provider
// keeps the full Claude Code wire image: DefaultExecutor only strips
// Claude Code identity headers for anthropic-compatible-* nodes, never
// for a built-in provider id, so the spoof headers below reach upstream
// intact. The validate route already expects this id in its Claude branch
// (src/app/api/providers/validate/route.js) and uses cfg.headers, so the
// same fingerprint is used for key validation and for real requests.
export default {
  id: "agentrouter",
  alias: "agentrouter",
  uiAlias: "agentrouter",
  display: {
    name: "AgentRouter",
    icon: "hub",
    color: "#6366F1",
    textIcon: "AR",
    website: "https://agentrouter.org",
    notice: {
      text: "Anthropic-compatible gateway. Requests carry the full Claude Code fingerprint (Claude CLI headers).",
      apiKeyUrl: "https://agentrouter.org",
    },
  },
  category: "apikey",
  authType: "apikey",
  authModes: ["apikey"],
  transport: {
    baseUrl: "https://agentrouter.org/v1/messages",
    format: "claude",
    urlSuffix: "?beta=true",
    headers: { ...CLAUDE_CLI_SPOOF_HEADERS },
    auth: {
      combined: true,
      header: "x-api-key",
      scheme: "raw",
      anthropicVersion: true,
    },
  },
  // Seed catalogue (Claude models). Any other model id is still accepted
  // via passthroughModels, so agentrouter/<model> keeps working for ids
  // not listed here.
  models: [
    { id: "claude-sonnet-4-5-20250929", name: "Claude Sonnet 4.5" },
    { id: "claude-opus-4-5-20250929", name: "Claude Opus 4.5" },
    { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5" },
    { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku" },
  ],
  passthroughModels: true,
  serviceKinds: ["llm"],
};
