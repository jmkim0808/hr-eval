import { AdminNav } from "@/components/AdminNav";
import { BackupNotice, FinalExcelButton } from "@/components/ExportButtons";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/server/authz/actor";
import { getCurrentCycle } from "@/server/repo/cycles";
import { backupDue } from "@/server/repo/export";

const CONFIRMED = ["confirmed", "results_sent", "closed"];

export default async function ResultsPage() {
  const a = await requireAdmin();
  const cycle = await getCurrentCycle(a);
  const due = cycle ? await backupDue(a, cycle.id) : false;
  return (
    <>
      <AdminNav current="/admin/results" />
      <main className="flex flex-col gap-6 px-8 py-6">
        <PageHeader title="결과 발송" description={`${cycle ? `${cycle.year}년 정기평가 · ` : ""}확정한 결과를 내려받고, 직원에게 결과 알림을 보냅니다`} />
        {due && <BackupNotice />}
        <Card>
          <CardHeader>
            <CardTitle>최종결과 엑셀</CardTitle>
            <CardDescription>연봉조정용 · 이름·부서·그룹·최종점수·평가등급 · 내려받을 때마다 작업 기록에 남습니다</CardDescription>
          </CardHeader>
          <CardContent>
            <FinalExcelButton enabled={!!cycle && CONFIRMED.includes(cycle.status)} />
          </CardContent>
        </Card>
      </main>
    </>
  );
}
