import { DashboardLayout } from "@/shared/components";

// Dashboard HTML must never be prerendered or cached by an intermediary.
// Every dashboard page reads per-instance state (machineId, DB settings, auth),
// so a prerendered shell bakes the BUILD machine's values into the payload and
// ships them to every client. It also pins the old buildId: after a redeploy the
// cached HTML still references chunks whose hashes no longer exist, so the app
// loads, every chunk 404s, and the dashboard renders blank. Render per request.
export const dynamic = "force-dynamic";

export default function DashboardRootLayout({ children }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}

