import { NextResponse } from "next/server";
import { deleteProviderConnectionsByProvider, deleteProviderNode, getProviderConnections, getProviderNodeById, updateProviderConnection, updateProviderNode } from "@/models";
import {
  compatibleNodeToProviderSpecificData,
  normalizeCustomHeaders,
  normalizeUrlSuffix,
} from "@/lib/providerNormalization";

// PUT /api/provider-nodes/[id] - Update provider node
export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, prefix, apiType, baseUrl, claudeFingerprint, urlSuffix, authHeader, customHeaders } = body;
    const node = await getProviderNodeById(id);

    if (!node) {
      return NextResponse.json({ error: "Provider node not found" }, { status: 404 });
    }

    if (!name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    if (!prefix?.trim()) {
      return NextResponse.json({ error: "Prefix is required" }, { status: 400 });
    }

    // Only validate apiType for OpenAI Compatible nodes
    if (node.type === "openai-compatible" && (!apiType || !["chat", "responses"].includes(apiType))) {
      return NextResponse.json({ error: "Invalid OpenAI compatible API type" }, { status: 400 });
    }

    if (!baseUrl?.trim()) {
      return NextResponse.json({ error: "Base URL is required" }, { status: 400 });
    }

    let sanitizedBaseUrl = baseUrl.trim();
    
    // Sanitize Base URL for Anthropic Compatible
    if (node.type === "anthropic-compatible") {
      sanitizedBaseUrl = sanitizedBaseUrl.replace(/\/$/, "");
      if (sanitizedBaseUrl.endsWith("/messages")) {
        sanitizedBaseUrl = sanitizedBaseUrl.slice(0, -9); // remove /messages
      }
    }

    // Sanitize Base URL for Custom Embedding (strip trailing slash and /embeddings)
    if (node.type === "custom-embedding") {
      sanitizedBaseUrl = sanitizedBaseUrl.replace(/\/$/, "");
      if (sanitizedBaseUrl.endsWith("/embeddings")) {
        sanitizedBaseUrl = sanitizedBaseUrl.slice(0, -"/embeddings".length);
      }
    }

    const updates = {
      name: name.trim(),
      prefix: prefix.trim(),
      baseUrl: sanitizedBaseUrl,
    };

    if (node.type === "openai-compatible") {
      updates.apiType = apiType;
    }

    // Claude fingerprint fields live on Anthropic-compatible nodes only.
    if (node.type === "anthropic-compatible") {
      if (authHeader !== undefined && !["x-api-key", "bearer"].includes(authHeader)) {
        return NextResponse.json({ error: "Invalid auth header" }, { status: 400 });
      }
      // Only overwrite fields the caller sent: a partial update (or a stale
      // caller) must not silently wipe a stored fingerprint.
      if (claudeFingerprint !== undefined) updates.claudeFingerprint = claudeFingerprint === true;
      if (urlSuffix !== undefined) updates.urlSuffix = normalizeUrlSuffix(urlSuffix);
      if (authHeader !== undefined) updates.authHeader = authHeader === "bearer" ? "bearer" : "x-api-key";
      if (customHeaders !== undefined) updates.customHeaders = normalizeCustomHeaders(customHeaders);
    }

    const updated = await updateProviderNode(id, updates);

    const connections = await getProviderConnections({ provider: id });
    await Promise.all(connections.map((connection) => {
      const syncData = node.type === "anthropic-compatible"
        ? compatibleNodeToProviderSpecificData(updated)
        : {
            prefix: prefix.trim(),
            apiType: node.type === "openai-compatible" ? apiType : undefined,
            baseUrl: sanitizedBaseUrl,
            nodeName: updated.name,
          };
      return updateProviderConnection(connection.id, {
        providerSpecificData: {
          ...(connection.providerSpecificData || {}),
          ...syncData,
        },
      });
    }));

    return NextResponse.json({ node: updated });
  } catch (error) {
    console.log("Error updating provider node:", error);
    return NextResponse.json({ error: "Failed to update provider node" }, { status: 500 });
  }
}

// DELETE /api/provider-nodes/[id] - Delete provider node and its connections
export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const node = await getProviderNodeById(id);

    if (!node) {
      return NextResponse.json({ error: "Provider node not found" }, { status: 404 });
    }

    await deleteProviderConnectionsByProvider(id);
    await deleteProviderNode(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.log("Error deleting provider node:", error);
    return NextResponse.json({ error: "Failed to delete provider node" }, { status: 500 });
  }
}
