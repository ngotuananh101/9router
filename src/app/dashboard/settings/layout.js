// This segment sits outside the (dashboard) route group, so it does not inherit
// that group's per-request rendering. Route-level config exports (`force-dynamic`)
// are ignored on "use client" pages, so the opt-out has to live in a server
// component — this layout runs on the server and covers every page below it.
//
// Without it, /dashboard/settings/pricing is prerendered with
// `s-maxage=31536000`; a caching proxy then keeps serving that HTML after a
// redeploy, when its chunk hashes no longer exist on disk.
export const dynamic = "force-dynamic";

export default function SettingsLayout({ children }) {
  return children;
}
