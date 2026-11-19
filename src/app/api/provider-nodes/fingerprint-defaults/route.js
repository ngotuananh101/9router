import { NextResponse } from "next/server";
import { getClaudeFingerprintDefaults } from "open-sse/providers/shared.js";

export const dynamic = "force-dynamic";

// GET /api/provider-nodes/fingerprint-defaults - Claude Code fingerprint preset
// for custom Anthropic-compatible nodes (AgentRouter defaults, editable in the modal)
export async function GET() {
  return NextResponse.json(getClaudeFingerprintDefaults());
}
