import { NextResponse } from "next/server";
import { getCodexFingerprintDefaults } from "open-sse/providers/shared.js";

export const dynamic = "force-dynamic";

// GET /api/provider-nodes/codex-fingerprint-defaults - Codex CLI fingerprint preset
// for custom OpenAI-compatible nodes (fixed preset, no editing in the modal)
export async function GET() {
  return NextResponse.json(getCodexFingerprintDefaults());
}
