import { CalendarDays, Lock, Medal } from "lucide-react";
import { AdminNav } from "@/components/AdminNav";
import { PageHeader } from "@/components/PageHeader";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { fmtDay } from "@/domain/periods";
import { requireAdmin } from "@/server/authz/actor";
import { bonusEditable, listBonus } from "@/server/repo/bonus";
import { getCycleDetail, getCurrentCycle } from "@/server/repo/cycles";
import { BonusTable } from "./BonusTable";
import { BonusUpload } from "./BonusUpload";

export default async function BonusPage() {
  const a = await requireAdmin();
  const cur = await getCurrentCycle(a);
  const cycle = cur ? await getCycleDetail(a, cur.year) : null;
  const rows = cycle ? await listBonus(a, cycle.id) : [];
  const locked = !!cycle && !bonusEditable(cycle);
  const done = rows.filter((r) => r.values).length;
  return (
    <>
      <AdminNav current="/admin/bonus" />
      <main className="flex flex-col gap-6 px-8 py-6">
        <PageHeader title="가점 입력" description={`${cycle ? `${cycle.year}년 정기평가 · ` : ""}개별담당자가 산정한 가점을 받아 넣습니다 · 평가등급 확정 전까지 단계와 상관없이 넣을 수 있습니다`} />
        {!cycle || rows.length === 0 ? (
          <Card>
            <Empty icon={<Medal aria-hidden="true" />} title="아직 가점을 넣을 대상자가 없습니다">평가 시작 설정에서 직원 명단을 먼저 올려 주세요.</Empty>
          </Card>
        ) : (
          <>
            {locked && (
              <Alert variant="neutral">
                <Lock aria-hidden="true" />
                <AlertDescription>평가등급이 확정되어 가점을 더 이상 인정하지 않습니다.</AlertDescription>
              </Alert>
            )}
            <Card>
              <CardHeader>
                <CardTitle>템플릿으로 한 번에 넣기</CardTitle>
                <CardDescription className="flex items-center gap-1.5">
                  <CalendarDays className="size-3.5" aria-hidden="true" />
                  가점 인정 기준일 {fmtDay(cycle.bonusCutoff)} · 템플릿에는 대상자 명단이 미리 들어 있습니다
                </CardDescription>
              </CardHeader>
              <CardContent>
                <BonusUpload roster={rows} locked={locked} cutoff={fmtDay(cycle.bonusCutoff)} />
              </CardContent>
            </Card>
            <Card className="pb-0">
              <CardHeader>
                <CardTitle>
                  가점 표 · 반영 {done} / {rows.length}
                </CardTitle>
                <CardDescription>줄을 누르면 한 사람씩 입력합니다 · 징계사항은 합계에서 빠집니다 · 다면평가는 팀장만</CardDescription>
              </CardHeader>
              <BonusTable rows={rows} locked={locked} />
            </Card>
          </>
        )}
      </main>
    </>
  );
}
