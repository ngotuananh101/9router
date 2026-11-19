# Design: Codex fingerprint switch for OpenAI-compatible nodes, and switch-only cleanup for Claude

Status: implemented 2026-11-19 on branch feat/codex-fingerprint, plan at docs/superpowers/plans/2026-11-19-codex-fingerprint.md

## Intent

Some gateways only accept requests that look like they come from Codex CLI.
Today that needs a new built-in provider in code (AgentRouter's GPT lane is
the example). A switch on custom OpenAI-compatible nodes should do it
without code, mirroring the Claude fingerprint feature that just merged
(08e205eb).

Second: the custom-headers editor in the Claude fingerprint UI was only
for testing. Ponta decision 2026-11-19: remove the editor, keep only the
switch. Applies to Claude (already merged) and to Codex (this design).

## Decisions already made (Ponta)

- Approach A for Codex: mirror the Claude fingerprint. 2026-11-19.
- Cleanup scope A: remove only the custom-headers editor; keep the URL
  suffix and auth fields for Claude. 2026-11-19.
- Codex is switch-only from the start: fixed preset, no editor.

## Goals

- A custom OpenAI-compatible node with apiType responses can send requests
  carrying Codex CLI identity (3 headers) with one switch.
- Switch off: the node behaves exactly as today.
- Claude modals lose the header-rows editor; switch, suffix and auth stay;
  the stored preset headers are still sent, invisibly.
- Check validates with the same headers and probes the Responses endpoint.
- Switch-on always applies the current preset, so re-enabling resets any
  previously stored headers.

## Non-goals

- No changes to the built-in codex or AgentRouter providers.
- No Codex switch for chat apiType nodes (Codex CLI only speaks Responses).
- No fingerprint on the model-discovery route (same deferred follow-up as
  Claude, review minor 12).
- No migration or removal of stored customHeaders data: nodes that already
  have hand-edited Claude headers keep sending them; they just cannot be
  edited anymore.
- No change to Claude executor or validate behaviour other than the UI
  removal.

## How it works today (verified in code, 2026-11-19)

- Codex identity in-repo: open-sse/providers/registry/codex.js
  transport.headers are originator codex_cli_rs, User-Agent
  codex_cli_rs/0.167.1, version 0.167.1; format openai-responses; baseUrl
  chatgpt.com/backend-api/codex/responses. AgentRouter's GPT lane mirrors
  it at 0.159.0, already drifted.
- Custom OpenAI nodes: apiType chat or responses is stored on
  providerSpecificData; buildUrl goes to /responses when apiType is
  responses; the request format resolves to openai-responses. The
  transport half is done.
- DefaultExecutor.buildHeaders has no strip block for openai-compatible
  nodes; auth defaults to Bearer. The Claude fingerprint merge block is
  anthropic-gated only.
- POST /api/providers, openai branch, builds an inline object with prefix,
  apiType, baseUrl, nodeName: no fingerprint fields. The anthropic branch
  uses compatibleNodeToProviderSpecificData.
- The mapper returns claudeFingerprint, urlSuffix, authHeader,
  customHeaders (plus apiType when present).
- Validate, OpenAI branch: GET /models with Bearer only; fallback POSTs
  /chat/completions. No identity headers, no /responses probe.
- Modals: AddCompatibleModal, OpenAI variant (hasApiType true), has an
  apiType select defaulting to chat; the Claude fingerprint section is
  gated on not hasApiType. EditCompatibleNodeModal takes isAnthropic; the
  OpenAI section is the not isAnthropic branch.

## Design

### Stored fields

- New: codexFingerprint (boolean) on the node. Reuse customHeaders
  (object) for the 3 preset headers. No urlSuffix and no authHeader for
  Codex: Bearer is already the default, and there is no beta-query
  equivalent.
- nodesRepo createProviderNode whitelist gains codexFingerprint. POST and
  PUT accept it. PUT only overwrites fingerprint fields present in the
  body (the rule from the Claude review fix pass applies to the Codex
  fields too).
- PUT sync scoping, extending the Task 3 ruling from the Claude feature:
  anthropic nodes sync the Claude fields, openai nodes sync the Codex
  fields, embedding nodes sync neither. customHeaders is shared storage
  (one node is one type, so no conflict).
- Node to connection flow (builder-check Q2): the mapper
  compatibleNodeToProviderSpecificData gains codexFingerprint, emitted
  as a Boolean defaulting to false alongside the Claude fields (the
  executor gates on the flag AND the provider prefix, so a false flag is
  inert on the other type). POST /api/providers, openai branch, adds
  codexFingerprint and customHeaders from the node to its inline object
  (the inline shape is kept, minimal diff). PUT re-sync for openai nodes
  covers codexFingerprint and customHeaders as well as the existing
  prefix, apiType, baseUrl and nodeName.

### Defaults, single source of truth

- New getCodexFingerprintDefaults() in open-sse/providers/shared.js
  returning customHeaders with originator, User-Agent and version.
- CODEX_CLI_VERSION becomes the single source in shared.js, mirroring
  CLAUDE_CLI_VERSION which already lives there; registry/codex.js reads
  it instead of its own module-private const. The builder must verify
  there is no import cycle (codex.js currently imports only
  ../models/helpers.js). If a cycle appears, keep the const in codex.js
  and have the defaults function import it from there; duplicating the
  version with a bump comment is the last resort.
- New route GET /api/provider-nodes/codex-fingerprint-defaults, mirroring
  fingerprint-defaults.

### Executor

- buildHeaders: a parallel fingerprint block gated on codexFingerprint
  true and the provider starting with openai-compatible-. Merge the
  stored customHeaders last, skipping non-string values. Reserved set:
  authorization, content-type, accept. User-Agent, originator and version
  are the fingerprint and must NOT be reserved.
- No apiType check in the executor: the modal gates the switch on apiType
  responses. A node flipped back to chat keeps sending the headers, which
  are inert there.
- buildUrl: no change.

### Validate

- OpenAI branch: when codexFingerprint is true, attach the 3 headers to
  the /models probe. The fallback (when a modelId is given) POSTs
  /responses with body model, input ping, max_output_tokens 1, instead of
  /chat/completions. A valid responses probe reports valid with method
  responses.
- Builder-check Q4, answered by Ponta 2026-11-19: the target gateway has
  /models, so Check without a modelId probes /models with the 3 headers
  and that is sufficient; no model-less /responses probe is needed.

### Modals

- AddCompatibleModal, OpenAI variant: Toggle "Send as Codex", shown when
  apiType is responses. Every turn-on fetches the Codex defaults and
  stores the preset invisibly; the payload includes codexFingerprint and
  customHeaders. No rows editor, no Reset button, no paste-keys warning.
- EditCompatibleNodeModal, not isAnthropic branch: the same switch,
  gated on formData.apiType responses; pre-fill codexFingerprint from
  the node.
- apiType flip (builder-check Q3): if the user changes apiType from
  responses to chat after turning the switch on, the switch hides and
  the payload resets codexFingerprint to false. Flipping back to
  responses shows the switch off; re-enabling re-applies the preset.
  Applies to Add and Edit alike.
- Claude cleanup, both modals: delete the header-rows editor (rows state,
  add, remove and update handlers, Reset button, do-not-paste-keys
  warning). Keep the switch, the suffix field, the auth select, and the
  defaults fetch on every turn-on (the preset is stored invisibly). The
  Edit modal keeps pre-filling suffix and auth from the node; stored
  customHeaders stay as-is.
- Turn-on behaviour, both fingerprints: every turn-on fetches the current
  preset and overwrites the stored customHeaders. This replaces the old
  fetch-once plus Reset button, and gives a reset path for nodes whose
  headers were hand-edited during testing.

### Tests

Mirror the Claude suite: defaults (1), executor (merge when on, plain
when off, reserved Authorization dropped, User-Agent kept), mapper
(Codex fields present, openai sync), POST providers openai branch, PUT
sync to existing connections, validate (models probe plus responses
fallback probe).
Claude cleanup: the existing Claude tests are unchanged (the mechanism is
untouched); modal changes are verified by lint plus Ponta's manual check
(the repo has no React component harness).

## Open questions and risks

- Version drift: AgentRouter mirrors 0.159.0 while codex.js is at
  0.167.1. Single-sourcing the version in shared.js fixes the new
  preset; AgentRouter's stale mirror is out of scope.
- A gateway that checks more than headers (body shape beyond the
  Responses format, e.g. store or reasoning fields) is not covered; the
  translator already converts to Responses format for apiType responses.
- Existing nodes with hand-edited Claude customHeaders keep those values
  until the switch is turned off and on again, which re-applies the
  preset. The UI no longer shows them.

## Verification

- Full suite versus baseline (49 pre-existing failures on master), lint
  on changed files, production build.
- Manual check by Ponta: Claude modal shows switch, suffix and auth only,
  no rows; Codex switch appears only when apiType is responses; save and
  reopen returns saved values. Live end-to-end against a Codex-gated
  gateway if Ponta has one to test against.

## Related docs

- Claude fingerprint design:
  docs/superpowers/specs/2026-11-19-custom-compatible-claude-fingerprint-design.md
  (amended by this doc: the rows editor is removed, turn-on always
  re-applies the preset).
- Claude fingerprint plan:
  docs/superpowers/plans/2026-11-19-custom-compatible-claude-fingerprint.md
