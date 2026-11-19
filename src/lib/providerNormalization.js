import { AI_PROVIDERS } from "../shared/constants/providers.js";

/**
 * Detect xAI Grok models by id pattern (grok-*, Grok_*, etc).
 * @param {string} modelId
 * @returns {boolean}
 */
export function isXaiModel(modelId) {
  return typeof modelId === "string" && /^grok[-_]/i.test(modelId.trim());
}

export function normalizeProviderId(provider) {
  if (typeof provider !== "string") return provider;

  const trimmed = provider.trim();
  if (AI_PROVIDERS[trimmed]) return trimmed;

  const slug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (AI_PROVIDERS[slug]) return slug;

  const providerByName = Object.values(AI_PROVIDERS).find(
    (entry) => entry.name?.toLowerCase() === trimmed.toLowerCase()
  );
  return providerByName?.id || trimmed;
}

export function normalizeProviderSpecificData(provider, body = {}, providerSpecificData = null) {
  const next = providerSpecificData && typeof providerSpecificData === "object"
    ? { ...providerSpecificData }
    : {};

  if (provider === "ollama-local") {
    const baseUrl = (
      next.baseUrl ||
      body.baseUrl ||
      body.baseURL ||
      body.ollamaHostUrl ||
      ""
    ).trim();

    if (baseUrl) next.baseUrl = baseUrl;
  }

  return Object.keys(next).length > 0 ? next : null;
}

/**
 * Normalize a stored URL suffix so it always parses as a query string:
 * "beta=true" becomes "?beta=true"; "?beta=true" and "&beta=true" pass
 * through; anything else becomes "".
 * @param {unknown} urlSuffix
 * @returns {string}
 */
export function normalizeUrlSuffix(urlSuffix) {
  if (typeof urlSuffix !== "string") return "";
  const trimmed = urlSuffix.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("?") || trimmed.startsWith("&") ? trimmed : `?${trimmed}`;
}

/**
 * Keep only string-valued custom headers: undici fetch throws on
 * non-string header values, so a corrupted stored row must not break
 * every request for the connection.
 * @param {unknown} customHeaders
 * @returns {object}
 */
export function normalizeCustomHeaders(customHeaders) {
  if (!customHeaders || typeof customHeaders !== "object" || Array.isArray(customHeaders)) return {};
  return Object.fromEntries(
    Object.entries(customHeaders).filter(
      ([name, value]) => typeof name === "string" && typeof value === "string",
    ),
  );
}

/**
 * Build providerSpecificData for a compatible connection from its node.
 * Single source for node-to-connection copying, used by the node and
 * connection routes so a new key or a node edit inherits the same data.
 * @param {object} node
 * @returns {object}
 */
export function compatibleNodeToProviderSpecificData(node) {
  const data = {
    prefix: node?.prefix,
    baseUrl: node?.baseUrl,
    nodeName: node?.name,
    claudeFingerprint: Boolean(node?.claudeFingerprint),
    urlSuffix: normalizeUrlSuffix(node?.urlSuffix),
    authHeader: node?.authHeader === "bearer" ? "bearer" : "x-api-key",
    customHeaders: normalizeCustomHeaders(node?.customHeaders),
  };
  if (node?.apiType) data.apiType = node.apiType;
  return data;
}
