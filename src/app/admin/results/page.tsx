import { Eye } from "lucide-react";
import { AdminNav } from "@/components/AdminNav";
import { BatchProgress } from "@/components/BatchProgress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BackupNotice, FinalExcelButton } from "@/components/ExportButtons";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/server/authz/actor";
import { getCurrentCycle, latestBatch } from "@/server/repo/cycles";
import { batchProgress } from "@/server/repo/outbox";
import { resultViews } from "@/server/repo/results";
import { SendResults } from "./SendResults";
import { backupDue } from "@/server/repo/export";

const CONFIRMED = ["confirmed", "results_sent", "closed"];

export default async function ResultsPage() {
  const a = await requireAdmin();
  const cycle = await getCurrentCycle(a);
  const due = cycle ? await backupDue(a, cycle.id) : false;
  const batchId = cycle ? await latestBatch(a, cycle.id, "result_notice") : null;
  const progress = batchId ? await batchProgress(a, batchId) : null;
  const views = cycle && batchId ? await resultViews(a, cycle.id) : [];
  const fmt = (iso: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
  return (
    <>
      <AdminNav current="/admin/results" />
      <main className="flex flex-col gap-6 px-8 py-6">
        <PageHeader title="결과 발송" description={`${cycle ? `${cycle.year}년 정기평가 · ` : ""}확정한 결과를 내려받고, 직원에게 결과 알림을 보냅니다`} />
        {due && <BackupNotice />}
        <Card>
          <CardHeader>
            <CardTitle>평가결과 알림</CardTitle>
            <CardDescription>메일에는 &quot;결과가 나왔습니다&quot;와 링크만 담깁니다 · 직원은 이메일 인증 뒤 내 평가결과에서 1차·2차 점수, 가점, 최종점수, 평가등급, 상위 %를 봅니다</CardDescription>
          </CardHeader>
          <CardContent>
            {batchId && progress ? (
              <BatchProgress batchId={batchId} initial={progress} />
            ) : (
              <SendResults enabled={cycle?.status === "confirmed"} version={cycle?.version ?? 0} count={views.length || (cycle ? (await resultViews(a, cycle.id)).length : 0)} />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>최종결과 엑셀</CardTitle>
            <CardDescription>연봉조정용 · 이름·부서·그룹·최종점수·평가등급 · 내려받을 때마다 작업 기록에 남습니다</CardDescription>
          </CardHeader>
          <CardContent>
            <FinalExcelButton enabled={!!cycle && CONFIRMED.includes(cycle.status)} />
          </CardContent>
        </Card>
        {views.length > 0 && (
          <Card className="pb-0">
            <CardHeader>
              <CardTitle>결과 열람</CardTitle>
              <CardDescription>직원이 내 평가결과를 연 마지막 시각 · 작업 기록에 남습니다</CardDescription>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>이름</TableHead>
                  <TableHead>부서</TableHead>
                  <TableHead>결과 열람</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {views.map((v) => (
                  <TableRow key={v.id} data-person={v.name}>
                    <TableCell className="font-medium">{v.name}</TableCell>
                    <TableCell>{v.department || "—"}</TableCell>
                    <TableCell className="tabular-nums">
                      {v.viewedAt ? (
                        <span className="flex items-center gap-1.5">
                          <Eye className="size-3.5 text-success" aria-hidden="true" />
                          결과 열람 ({v.name}, {fmt(v.viewedAt)})
                        </span>
                      ) : (
                        <span className="text-muted-foreground">아직 열지 않음</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </main>
    </>
  );
}
