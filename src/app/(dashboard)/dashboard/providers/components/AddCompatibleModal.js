"use client";

import { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { Badge, Button, Input, Modal, Select, Toggle } from "@/shared/components";

const VARIANT_CONFIG = {
  openai: {
    title: "Add OpenAI Compatible",
    type: "openai-compatible",
    defaultBaseUrl: "https://api.openai.com/v1",
    namePlaceholder: "OpenAI Compatible (Prod)",
    prefixPlaceholder: "oc-prod",
    baseUrlHint: "Use the base URL (ending in /v1) for your OpenAI-compatible API.",
    modelIdPlaceholder: "e.g. gpt-4, claude-3-opus",
    errorLabel: "OpenAI Compatible",
    hasApiType: true,
  },
  anthropic: {
    title: "Add Anthropic Compatible",
    type: "anthropic-compatible",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    namePlaceholder: "Anthropic Compatible (Prod)",
    prefixPlaceholder: "ac-prod",
    baseUrlHint: "Use the base URL (ending in /v1) for your Anthropic-compatible API. The system will append /messages.",
    modelIdPlaceholder: "e.g. claude-3-opus",
    errorLabel: "Anthropic Compatible",
    hasApiType: false,
  },
};

const API_TYPE_OPTIONS = [
  { value: "chat", label: "Chat Completions" },
  { value: "responses", label: "Responses API" },
];

const AUTH_HEADER_OPTIONS = [
  { value: "x-api-key", label: "x-api-key" },
  { value: "bearer", label: "Authorization: Bearer" },
];

function AddCompatibleModal({ variant, isOpen, onClose, onCreated }) {
  const config = VARIANT_CONFIG[variant];
  const initialFormData = () => ({
    name: "",
    prefix: "",
    ...(config.hasApiType ? { apiType: "chat" } : {}),
    baseUrl: config.defaultBaseUrl,
    claudeFingerprint: false,
    codexFingerprint: false,
    urlSuffix: "",
    authHeader: "x-api-key",
    customHeaders: {},
  });

  const [formData, setFormData] = useState(initialFormData);
  const [submitting, setSubmitting] = useState(false);
  const [checkKey, setCheckKey] = useState("");
  const [checkModelId, setCheckModelId] = useState("");
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);

  // openai: reset baseUrl when apiType changes; anthropic: reset checks when opened
  useEffect(() => {
    if (config.hasApiType) {
      setFormData((prev) => ({ ...prev, baseUrl: config.defaultBaseUrl }));
    } else if (isOpen) {
      setValidationResult(null);
      setCheckKey("");
      setCheckModelId("");
    }
  }, [config.hasApiType ? formData.apiType : isOpen]);

  const loadFingerprintDefaults = async () => {
    const res = await fetch("/api/provider-nodes/fingerprint-defaults");
    return res.json();
  };

  const loadCodexFingerprintDefaults = async () => {
    const res = await fetch("/api/provider-nodes/codex-fingerprint-defaults");
    return res.json();
  };

  const applyFingerprintDefaults = (defaults) => {
    setFormData((prev) => ({
      ...prev,
      urlSuffix: defaults.urlSuffix || "",
      authHeader: defaults.authHeader || "x-api-key",
      customHeaders: { ...(defaults.customHeaders || {}) },
    }));
  };

  const handleFingerprintToggle = async (checked) => {
    setFormData((prev) => ({ ...prev, claudeFingerprint: checked }));
    if (checked) {
      try {
        const defaults = await loadFingerprintDefaults();
        applyFingerprintDefaults(defaults);
      } catch (error) {
        console.log("Error loading fingerprint defaults:", error);
      }
    }
  };

  const handleCodexFingerprintToggle = async (checked) => {
    setFormData((prev) => ({ ...prev, codexFingerprint: checked }));
    if (checked) {
      try {
        const defaults = await loadCodexFingerprintDefaults();
        setFormData((prev) => ({
          ...prev,
          customHeaders: { ...(defaults.customHeaders || {}) },
        }));
      } catch (error) {
        console.log("Error loading Codex fingerprint defaults:", error);
      }
    }
  };

  const fingerprintPayload = !config.hasApiType
    ? {
        claudeFingerprint: formData.claudeFingerprint,
        urlSuffix: formData.urlSuffix,
        authHeader: formData.authHeader,
        customHeaders: formData.customHeaders,
      }
    : {
        codexFingerprint: formData.codexFingerprint,
        customHeaders: formData.customHeaders,
      };

  const handleSubmit = async () => {
    if (!formData.name.trim() || !formData.prefix.trim() || !formData.baseUrl.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/provider-nodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          prefix: formData.prefix,
          ...(config.hasApiType ? { apiType: formData.apiType } : {}),
          baseUrl: formData.baseUrl,
          type: config.type,
          ...fingerprintPayload,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        onCreated(data.node);
        setFormData(initialFormData());
        setCheckKey("");
        setValidationResult(null);
      }
    } catch (error) {
      console.log(`Error creating ${config.errorLabel} node:`, error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleValidate = async () => {
    setValidating(true);
    try {
      const res = await fetch("/api/provider-nodes/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: formData.baseUrl,
          apiKey: checkKey,
          type: config.type,
          modelId: checkModelId.trim() || undefined,
          ...fingerprintPayload,
        }),
      });
      const data = await res.json();
      setValidationResult(data);
    } catch {
      setValidationResult({ valid: false, error: "Network error" });
    } finally {
      setValidating(false);
    }
  };

  const renderValidationResult = () => {
    if (!validationResult) return null;
    const { valid, error, method } = validationResult;
    if (valid) {
      return (
        <>
          <Badge variant="success">Valid</Badge>
          {method === "chat" && (
            <span className="text-sm text-text-muted">(via inference test)</span>
          )}
        </>
      );
    }
    return (
      <div className="flex flex-col gap-1">
        <Badge variant="error">Invalid</Badge>
        {error && <span className="text-sm text-red-500">{error}</span>}
      </div>
    );
  };

  return (
    <Modal isOpen={isOpen} title={config.title} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Input
          label="Name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder={config.namePlaceholder}
          hint="Required. A friendly label for this node."
        />
        <Input
          label="Prefix"
          value={formData.prefix}
          onChange={(e) => setFormData({ ...formData, prefix: e.target.value })}
          placeholder={config.prefixPlaceholder}
          hint="Required. Used as the provider prefix for model IDs."
        />
        {config.hasApiType && (
          <Select
            label="API Type"
            options={API_TYPE_OPTIONS}
            value={formData.apiType}
            onChange={(e) =>
              setFormData({
                ...formData,
                apiType: e.target.value,
                ...(e.target.value !== "responses" ? { codexFingerprint: false } : {}),
              })
            }
          />
        )}
        <Input
          label="Base URL"
          value={formData.baseUrl}
          onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
          placeholder={config.defaultBaseUrl}
          hint={config.baseUrlHint}
        />
        {config.hasApiType && formData.apiType === "responses" && (
          <Toggle
            checked={formData.codexFingerprint}
            onChange={handleCodexFingerprintToggle}
            label="Send as Codex"
            description="Requests carry the full Codex fingerprint. Only use this for gateways that require it."
          />
        )}
        {!config.hasApiType && (
          <Toggle
            checked={formData.claudeFingerprint}
            onChange={handleFingerprintToggle}
            label="Send as Claude Code"
            description="Requests carry the full Claude Code fingerprint. Only use this for gateways that require it."
          />
        )}
        {!config.hasApiType && formData.claudeFingerprint && (
          <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
            <Input
              label="URL suffix"
              value={formData.urlSuffix}
              onChange={(e) => setFormData({ ...formData, urlSuffix: e.target.value })}
              placeholder="?beta=true"
              hint="Appended to every request URL, for example /models?beta=true."
            />
            <Select
              label="Auth header"
              options={AUTH_HEADER_OPTIONS}
              value={formData.authHeader}
              onChange={(e) => setFormData({ ...formData, authHeader: e.target.value })}
            />
          </div>
        )}
        <Input
          label="API Key (for Check)"
          type="password"
          value={checkKey}
          onChange={(e) => setCheckKey(e.target.value)}
        />
        <Input
          label="Model ID (optional)"
          value={checkModelId}
          onChange={(e) => setCheckModelId(e.target.value)}
          placeholder={config.modelIdPlaceholder}
          hint="If provider lacks /models endpoint, enter a model ID to validate via chat/completions instead."
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button
            onClick={handleValidate}
            disabled={!checkKey || validating || !formData.baseUrl.trim()}
            variant="secondary"
            className="w-full sm:w-auto"
          >
            {validating ? "Checking..." : "Check"}
          </Button>
          {renderValidationResult()}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            onClick={handleSubmit}
            fullWidth
            disabled={
              !formData.name.trim() ||
              !formData.prefix.trim() ||
              !formData.baseUrl.trim() ||
              submitting
            }
          >
            {submitting ? "Creating..." : "Create"}
          </Button>
          <Button onClick={onClose} variant="ghost" fullWidth>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}

AddCompatibleModal.propTypes = {
  variant: PropTypes.oneOf(["openai", "anthropic"]).isRequired,
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onCreated: PropTypes.func.isRequired,
};

export default AddCompatibleModal;
