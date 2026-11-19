"use client";

import { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { Button, Badge, Input, Modal, Select, Toggle } from "@/shared/components";

const AUTH_HEADER_OPTIONS = [
  { value: "x-api-key", label: "x-api-key" },
  { value: "bearer", label: "Authorization: Bearer" },
];

export default function EditCompatibleNodeModal({ isOpen, node, onSave, onClose, isAnthropic }) {
  const [formData, setFormData] = useState({
    name: "",
    prefix: "",
    apiType: "chat",
    baseUrl: "https://api.openai.com/v1",
    claudeFingerprint: false,
    urlSuffix: "",
    authHeader: "x-api-key",
    customHeaders: {},
  });
  const [saving, setSaving] = useState(false);
  const [checkKey, setCheckKey] = useState("");
  const [checkModelId, setCheckModelId] = useState("");
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [fingerprintDefaults, setFingerprintDefaults] = useState(null);

  useEffect(() => {
    if (node) {
      setFormData({
        name: node.name || "",
        prefix: node.prefix || "",
        apiType: node.apiType || "chat",
        baseUrl: node.baseUrl || (isAnthropic ? "https://api.anthropic.com/v1" : "https://api.openai.com/v1"),
        claudeFingerprint: node.claudeFingerprint === true,
        urlSuffix: typeof node.urlSuffix === "string" ? node.urlSuffix : "",
        authHeader: node.authHeader === "bearer" ? "bearer" : "x-api-key",
        customHeaders:
          node.customHeaders && typeof node.customHeaders === "object" && !Array.isArray(node.customHeaders)
            ? { ...node.customHeaders }
            : {},
      });
    }
  }, [node, isAnthropic]);

  const apiTypeOptions = [
    { value: "chat", label: "Chat Completions" },
    { value: "responses", label: "Responses API" },
  ];

  const loadFingerprintDefaults = async () => {
    if (fingerprintDefaults) return fingerprintDefaults;
    const res = await fetch("/api/provider-nodes/fingerprint-defaults");
    const defaults = await res.json();
    setFingerprintDefaults(defaults);
    return defaults;
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
    if (
      checked &&
      !fingerprintDefaults &&
      Object.keys(formData.customHeaders).length === 0 &&
      !formData.urlSuffix
    ) {
      try {
        const defaults = await loadFingerprintDefaults();
        applyFingerprintDefaults(defaults);
      } catch (error) {
        console.log("Error loading fingerprint defaults:", error);
      }
    }
  };

  const handleResetFingerprint = async () => {
    try {
      const defaults = await loadFingerprintDefaults();
      applyFingerprintDefaults(defaults);
    } catch (error) {
      console.log("Error loading fingerprint defaults:", error);
    }
  };

  const updateCustomHeader = (index, field, value) => {
    const rows = Object.entries(formData.customHeaders);
    rows[index][field === "name" ? 0 : 1] = value;
    setFormData((prev) => ({ ...prev, customHeaders: Object.fromEntries(rows) }));
  };

  const removeCustomHeader = (index) => {
    const rows = Object.entries(formData.customHeaders).filter((_, i) => i !== index);
    setFormData((prev) => ({ ...prev, customHeaders: Object.fromEntries(rows) }));
  };

  const addCustomHeader = () => {
    setFormData((prev) => {
      let name = "X-Custom-Header";
      let n = 2;
      while (Object.prototype.hasOwnProperty.call(prev.customHeaders, name)) {
        name = `X-Custom-Header-${n}`;
        n += 1;
      }
      return { ...prev, customHeaders: { ...prev.customHeaders, [name]: "" } };
    });
  };

  const fingerprintPayload = isAnthropic
    ? {
        claudeFingerprint: formData.claudeFingerprint,
        urlSuffix: formData.urlSuffix,
        authHeader: formData.authHeader,
        customHeaders: formData.customHeaders,
      }
    : {};

  const handleSubmit = async () => {
    if (!formData.name.trim() || !formData.prefix.trim() || !formData.baseUrl.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: formData.name,
        prefix: formData.prefix,
        baseUrl: formData.baseUrl,
        ...fingerprintPayload,
      };
      if (!isAnthropic) {
        payload.apiType = formData.apiType;
      }
      await onSave(payload);
    } finally {
      setSaving(false);
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
          type: isAnthropic ? "anthropic-compatible" : "openai-compatible",
          modelId: checkModelId.trim() || undefined,
          ...fingerprintPayload,
        }),
      });
      const data = await res.json();
      setValidationResult(data.valid ? "success" : "failed");
    } catch {
      setValidationResult("failed");
    } finally {
      setValidating(false);
    }
  };

  if (!node) return null;

  return (
    <Modal isOpen={isOpen} title={`Edit ${isAnthropic ? "Anthropic" : "OpenAI"} Compatible`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Input
          label="Name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder={`${isAnthropic ? "Anthropic" : "OpenAI"} Compatible (Prod)`}
          hint="Required. A friendly label for this node."
        />
        <Input
          label="Prefix"
          value={formData.prefix}
          onChange={(e) => setFormData({ ...formData, prefix: e.target.value })}
          placeholder={isAnthropic ? "ac-prod" : "oc-prod"}
          hint="Required. Used as the provider prefix for model IDs."
        />
        {!isAnthropic && (
          <Select
            label="API Type"
            options={apiTypeOptions}
            value={formData.apiType}
            onChange={(e) => setFormData({ ...formData, apiType: e.target.value })}
          />
        )}
        <Input
          label="Base URL"
          value={formData.baseUrl}
          onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
          placeholder={isAnthropic ? "https://api.anthropic.com/v1" : "https://api.openai.com/v1"}
          hint={`Use the base URL (ending in /v1) for your ${isAnthropic ? "Anthropic" : "OpenAI"}-compatible API.`}
        />
        {isAnthropic && (
          <Toggle
            checked={formData.claudeFingerprint}
            onChange={handleFingerprintToggle}
            label="Send as Claude Code"
            description="Requests carry the full Claude Code fingerprint. Only use this for gateways that require it."
          />
        )}
        {isAnthropic && formData.claudeFingerprint && (
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
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-text-main">Custom headers</span>
              {Object.entries(formData.customHeaders).map(([name, value], index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    value={name}
                    onChange={(e) => updateCustomHeader(index, "name", e.target.value)}
                    placeholder="Header name"
                    className="flex-1"
                  />
                  <Input
                    value={value}
                    onChange={(e) => updateCustomHeader(index, "value", e.target.value)}
                    placeholder="Value"
                    className="flex-1"
                  />
                  <Button variant="ghost" onClick={() => removeCustomHeader(index)}>
                    Remove
                  </Button>
                </div>
              ))}
              <Button variant="secondary" onClick={addCustomHeader} className="w-full sm:w-auto">
                Add header
              </Button>
            </div>
            <p className="text-xs text-text-muted">
              Do not paste API keys here. Custom headers are stored with the node, not in the secret store.
            </p>
            <div>
              <Button variant="secondary" onClick={handleResetFingerprint}>
                Reset to defaults
              </Button>
            </div>
          </div>
        )}
        <div className="flex gap-2">
          <Input
            label="API Key (for Check)"
            type="password"
            value={checkKey}
            onChange={(e) => setCheckKey(e.target.value)}
            className="flex-1"
          />
          <div className="pt-6">
            <Button onClick={handleValidate} disabled={!checkKey || validating || !formData.baseUrl.trim()} variant="secondary">
              {validating ? "Checking..." : "Check"}
            </Button>
          </div>
        </div>
        <Input
          label="Model ID (optional)"
          value={checkModelId}
          onChange={(e) => setCheckModelId(e.target.value)}
          placeholder="e.g. my-model-id"
          hint="If provider lacks /models endpoint, enter a model ID to validate via chat/completions instead."
        />
        {validationResult && (
          <Badge variant={validationResult === "success" ? "success" : "error"}>
            {validationResult === "success" ? "Valid" : "Invalid"}
          </Badge>
        )}
        <div className="flex gap-2">
          <Button onClick={handleSubmit} fullWidth disabled={!formData.name.trim() || !formData.prefix.trim() || !formData.baseUrl.trim() || saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
          <Button onClick={onClose} variant="ghost" fullWidth>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}

EditCompatibleNodeModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  node: PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string,
    prefix: PropTypes.string,
    apiType: PropTypes.string,
    baseUrl: PropTypes.string,
    claudeFingerprint: PropTypes.bool,
    urlSuffix: PropTypes.string,
    authHeader: PropTypes.string,
    customHeaders: PropTypes.object,
  }),
  onSave: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  isAnthropic: PropTypes.bool,
};
