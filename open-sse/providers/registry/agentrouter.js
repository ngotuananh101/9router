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
  // Multi-endpoint: chatCore picks the transport matching a model's
  // declared targetFormat (see opencode-go's grok/gpt responses models).
  // The Claude transport above stays the default for Claude models.
  // GPT models must NOT go through /v1/messages: AgentRouter maps them
  // internally to /v1/chat/completions, which rejects function tools +
  // reasoning_effort (observed 400 for gpt-6.1-sol). Their lane is
  // /v1/responses instead, with Bearer auth and Codex CLI identity
  // headers, not Claude headers. AgentRouter gates on client identity
  // before key validation, and a generic fetch client on /v1/responses
  // gets 401 unauthorized_client_error even with a valid key (observed
  // 2026-11-04). The Codex headers mirror 9router's own codex transport
  // (open-sse/providers/registry/codex.js, version 0.159.0).
  transports: [
    {
      format: "claude",
      baseUrl: "https://agentrouter.org/v1/messages",
      urlSuffix: "?beta=true",
      headers: { ...CLAUDE_CLI_SPOOF_HEADERS },
      auth: {
        combined: true,
        header: "x-api-key",
        scheme: "raw",
        anthropicVersion: true,
      },
    },
    {
      format: "openai-responses",
      baseUrl: "https://agentrouter.org/v1/responses",
      headers: {
        originator: "codex_cli_rs",
        "User-Agent": "codex_cli_rs/0.159.0",
        version: "0.159.0",
      },
      auth: { combined: true, header: "Authorization", scheme: "bearer" },
      thinkingFormat: "openai-responses",
    },
  ],
  // Seed catalogue (Claude models). Any other model id is still accepted
  // via passthroughModels, so agentrouter/<model> keeps working for ids
  // not listed here.
  models: [
    // Served by /v1/responses only: declaring targetFormat forces chatCore
    // past the Claude transport into translation to Responses, so tools +
    // reasoning no longer hit the chat-completions rejection above.
    // Other unlisted GPT ids still fall back to the Claude lane via
    // passthroughModels — list them here the same way to move them over.
    { id: "gpt-6.1-sol", name: "GPT 6.1 Sol", targetFormat: "openai-responses", supportedFormats: ["openai-responses"] },
    { id: "gpt-6-astra", name: "GPT 6 Astra", targetFormat: "openai-responses", supportedFormats: ["openai-responses"] },
    { id: "gpt-5.6-sol", name: "GPT 5.6 Sol", targetFormat: "openai-responses", supportedFormats: ["openai-responses"] },
  ],
  passthroughModels: true,
  serviceKinds: ["llm"],
};
