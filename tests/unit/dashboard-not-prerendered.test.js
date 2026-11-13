import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Regression guard for "every page is 404 after a redeploy behind a caching proxy".
//
// The dashboard shell used to be prerendered at build time and served with
// `cache-control: s-maxage=31536000` (Next's static default). A caching nginx in
// front honours that and keeps the old HTML for up to a year. After a rebuild the
// JS chunk hashes change, so that cached HTML still points at chunk URLs that no
// longer exist on disk — the document loads, every `/_next/static/*` fetch 404s,
// and the dashboard renders blank.
//
// Prerendering also baked per-instance values into the payload: the build
// machine's machineId ended up inside the HTML served to every client.
//
// The (dashboard) segment therefore must render per request.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const layoutPath = path.join(repoRoot, "src/app/(dashboard)/layout.js");

describe("dashboard layout is server-rendered per request", () => {
  it("declares dynamic = force-dynamic", () => {
    const src = readFileSync(layoutPath, "utf8");
    expect(src).toMatch(/export\s+const\s+dynamic\s*=\s*["']force-dynamic["']/);
  });

  it("does not opt back into static rendering via revalidate", () => {
    const src = readFileSync(layoutPath, "utf8");
    // `export const revalidate = <n>` on the layout would re-enable the full route
    // cache and bring the stale-HTML bug back.
    expect(src).not.toMatch(/export\s+const\s+revalidate\s*=/);
  });

  it("does not prerender any dashboard page in a build that exists on disk", () => {
    const distDir = process.env.NEXT_DIST_DIR || ".next";
    const buildRoot = path.join(repoRoot, distDir);
    if (!existsSync(buildRoot)) return; // not built in this checkout — skip

    const manifestPath = path.join(buildRoot, "prerender-manifest.json");
    if (!existsSync(manifestPath)) return;

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const routes = Object.keys(manifest.routes || {});
    const prerenderedDashboard = routes.filter(
      (r) => r === "/dashboard" || r.startsWith("/dashboard/"),
    );
    expect(prerenderedDashboard).toEqual([]);
  });

  // /dashboard/settings/pricing sits outside the (dashboard) group. Its page is a
  // client component, where route config exports are ignored — the opt-out must
  // live in a server-component layout for that segment.
  it("declares dynamic = force-dynamic on the out-of-group settings layout", () => {
    const src = readFileSync(
      path.join(repoRoot, "src/app/dashboard/settings/layout.js"),
      "utf8",
    );
    expect(src).toMatch(/export\s+const\s+dynamic\s*=\s*["']force-dynamic["']/);
  });
});
