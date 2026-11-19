# Custom compatible: Claude Code fingerprint switch

Date: 2026-11-19
Status: approved 2026-11-19, implemented 2026-11-19 on branch feat/claude-fingerprint-compatible, plan at docs/superpowers/plans/2026-11-19-custom-compatible-claude-fingerprint.md
Scope: Anthropic-compatible provider nodes only

## Intent and why

Some upstream gateways only accept requests that look like they come
from Claude Code. Today the only way to use such a gateway in 9Router
is to add a built-in provider in code, as was done for AgentRouter in
open-sse/providers/registry/agentrouter.js. That costs a code change,
a registry file, and a release for every new gateway.

The goal is to let Ponta add such a gateway from the dashboard with a
custom Anthropic-compatible node: flip one switch, get all the
request-shaping fields pre-filled with the AgentRouter defaults, and
edit any of them if the gateway needs something different.

## Goals

- A custom Anthropic-compatible node can carry the full Claude Code
  fingerprint, so a gateway that gates on client identity accepts it
  without a new built-in provider.
- Turning the switch on shows every custom field, pre-filled with
  working defaults. The user edits only what differs.
- The same switch and fields exist when creating a node and when
  editing an existing node.
- The Check button in the modal validates with the same fingerprint,
  so a correct key does not report Invalid.
- Existing nodes and built-in providers do not change behaviour
  unless the switch is turned on for that node.

## Non-goals

- OpenAI-compatible Codex fingerprint. That is a separate preset
  for another day.
- The AgentRouter GPT lane, multi-transport routing to the
  responses endpoint. Out of scope for v1.
- Changing the AgentRouter built-in provider. It stays as is.
- A generic per-model transport editor.

## Anti-goals

- Silently changing existing nodes. The switch defaults to OFF.
- Letting custom headers override the auth token or Content-Type.
  Auth is always applied by the executor after custom headers.
- Storing secrets in the custom headers. Headers live in node data,
  not in the secret store. The UI must say not to paste API keys there.

## How it works today

- AddCompatibleModal has only Name, Prefix, Base URL, plus API Type
  for OpenAI. There is nowhere to set headers.
- POST /api/provider-nodes stores only name, prefix, apiType and
  baseUrl. createProviderNode in nodesRepo whitelists those fields.
- POST /api/providers rebuilds providerSpecificData for a compatible
  connection entirely from its node: prefix, apiType, baseUrl,
  nodeName. PUT /api/provider-nodes/[id] syncs the same fields to
  all existing connections of the node.
- DefaultExecutor.buildHeaders strips Claude Code identity headers
  for anthropic-compatible nodes only: it deletes X-App and
  Anthropic-Dangerous-Direct-Browser-Access and removes the
  claude-code-20250219 flag from Anthropic-Beta, for any base URL
  that is not api.anthropic.com. It never strips for a built-in
  provider id, which is why AgentRouter works.
- The AgentRouter registry entry carries the full fingerprint:
  CLAUDE_CLI_SPOOF_HEADERS from open-sse/providers/shared.js,
  urlSuffix ?beta=true, x-api-key auth, and a second transport for
  GPT models on the responses endpoint.
- The provider-nodes validate endpoint probes /models with only
  x-api-key, anthropic-version and Bearer. It sends no fingerprint.

## Approaches considered

- A1. Fixed fingerprint, no editable fields. One toggle that injects
  the AgentRouter headers exactly. Simplest, but Ponta rejected it:
  she wants to see and edit every field.
- A2. Toggle plus editable fields pre-filled with defaults. Chosen.
  One switch, all fields visible when on, defaults filled in, user
  edits what differs.
- A3. Free-form headers only, no preset. Rejected: the user would
  have to type fourteen headers from scratch for every gateway.
- B. Pass through the original client headers verbatim. Rejected by
  Ponta on 2026-11-19: it only works when the calling client really
  is Claude Code, not Cursor or OpenCode.

## Design (A2)

### UI

AddCompatibleModal, Anthropic variant only, and
EditCompatibleNodeModal get a Toggle from shared components:

- Label: Send as Claude Code.
- Hint: Requests carry the full Claude Code fingerprint. Only use
  this for gateways that require it.
- Default: OFF.

When ON, show a section with every field, pre-filled:

- URL suffix: text input, default ?beta=true (the AgentRouter value).
- Auth header: select, x-api-key (default) or Authorization Bearer.
- Custom headers: key-value rows, pre-filled with the fourteen
  CLAUDE_CLI_SPOOF_HEADERS entries: Anthropic-Version,
  Anthropic-Beta, Anthropic-Dangerous-Direct-Browser-Access,
  User-Agent, X-App, X-Stainless-Helper-Method,
  X-Stainless-Retry-Count, X-Stainless-Runtime-Version,
  X-Stainless-Package-Version, X-Stainless-Runtime,
  X-Stainless-Lang, X-Stainless-Arch, X-Stainless-Os,
  X-Stainless-Timeout. Each row is editable, rows can be added or
  removed, and a Reset to defaults button restores the preset.

Defaults come from a new endpoint GET
/api/provider-nodes/fingerprint-defaults, computed server-side from
the same shared.js constants, so the User-Agent version and the
X-Stainless Arch and Os values match the server host instead of
being hardcoded in the browser. The modal fetches them the first
time the switch is turned on.

### Storage and API

New node fields: claudeFingerprint (boolean), urlSuffix (string),
authHeader (x-api-key or bearer), customHeaders (object of
name to value).

- nodesRepo.createProviderNode whitelists the new fields.
- POST /api/provider-nodes accepts and stores them.
- PUT /api/provider-nodes/[id] accepts them and syncs them into
  providerSpecificData of every connection of the node, next to
  prefix, apiType, baseUrl and nodeName.
- POST /api/providers copies them from the node into
  providerSpecificData when a new API-key connection is created,
  so key-pool connections of the node all share the same
  fingerprint.

### Runtime

DefaultExecutor, for anthropic-compatible nodes only:

- If providerSpecificData.claudeFingerprint is true, skip the
  existing strip block entirely.
- Append providerSpecificData.urlSuffix after /messages in buildUrl,
  but only when claudeFingerprint is true: with the switch off the
  node behaves exactly as before, even if a suffix is stored.
- In buildHeaders, merge providerSpecificData.customHeaders after
  auth and after the Claude-model beta logic, so user edits win
  over the computed beta flags. Reserved headers are never taken
  from customHeaders: x-api-key, Authorization, Content-Type,
  Accept and anthropic-version are always set by the executor.
- Auth header follows providerSpecificData.authHeader: x-api-key
  raw (default, plus the existing extra Bearer for third-party
  gateways) or Authorization Bearer only.

### Validation

POST /api/provider-nodes/validate accepts the same four fields.
When claudeFingerprint is true, the /models probe and the chat
fallback probe send the custom headers and the URL suffix, so
Check reflects what real requests will send. The probes send the
same auth shape as real requests: bearer mode sends Authorization
only, x-api-key mode sends both.

### Security notes

This feature intentionally impersonates Claude Code. It is opt-in
per node, defaults to OFF, and the UI states what it does. No
change to SSRF handling: baseUrl validation stays as is. Custom
headers must never carry credentials; the modal warns about it,
and the executor refuses auth headers from the custom set.

## What is left to the builder

- Exact Toggle label and hint copy, and the key-value row
  component: reuse an existing pattern if one exists, otherwise a
  minimal rows editor in the modal.
- Whether the fingerprint-defaults endpoint is a new route or a
  field on an existing one.
- Test list: executor unit tests for strip-skip, header merge
  order and reserved headers; API tests for node create, node
  edit propagation to connections, and connection creation copy;
  modal test that turning the switch on shows the fields with
  defaults.
- Verification: a custom Anthropic-compatible node pointed at
  AgentRouter with the switch on must validate and serve a Claude
  model; with the switch off it must behave exactly as today.

## Open decision for Ponta

Switch default is OFF in this design, so nothing changes unless
she turns it on. If she wants it ON by default for new
Anthropic-compatible nodes, that is a one-line change at approval
time.
