import { AppHeader } from "@/components/AppHeader";
import { requireReportViewer } from "@/server/authz/actor";

export const dynamic = "force-dynamic";

export default async function ReportLayout({ children }: { children: React.ReactNode }) {
  const a = await requireReportViewer();
  return (
    <>
      <AppHeader viewer={a.name} />
      {children}
    </>
  );
}
