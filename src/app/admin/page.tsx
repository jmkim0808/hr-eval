import Link from "next/link";
import { ClipboardList, Mail } from "lucide-react";
import { AdminNav } from "@/components/AdminNav";
import { BatchProgress } from "@/components/BatchProgress";
import { PageHeader } from "@/components/PageHeader";
import { StageBar } from "@/components/StageBar";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { fmtRange } from "@/domain/periods";
import { requireAdmin } from "@/server/authz/actor";
import { getCurrentCycle, latestBatch } from "@/server/repo/cycles";
import { batchProgress } from "@/server/repo/outbox";

export default async function ProgressPage() {
  const a = await requireAdmin();
  const cycle = await getCurrentCycle(a);
  const batchId = cycle ? await latestBatch(a, cycle.id, "invite") : null;
  const progress = batchId ? await batchProgress(a, batchId) : null;
  const showInvite = !!progress && (progress.pending > 0 || progress.failed > 0);

  return (
    <>
      <AdminNav current="/admin" />
      <main className="flex flex-col gap-6 px-8 py-6">
        <PageHeader title="진행 현황" description={cycle ? `${cycle.year}년 정기평가 · 지금 누가 어디서 멈춰 있는지 봅니다` : "지금 누가 어디서 멈춰 있는지 봅니다"} />
        {!cycle ? (
          <Card>
            <Empty
              icon={<ClipboardList aria-hidden="true" />}
              title="아직 시작한 평가가 없습니다"
              action={
                <Link className={buttonVariants()} href="/admin/setup">
                  평가 시작 설정
                </Link>
              }
            >
              직원 명단을 올리고 기간을 정하면 평가를 시작할 수 있습니다.
            </Empty>
          </Card>
        ) : (
          <>
            <StageBar
              status={cycle.status}
              notes={{
                0: cycle.selfStart ? fmtRange(cycle.selfStart, cycle.selfEnd) : undefined,
                1: cycle.firstStart ? fmtRange(cycle.firstStart, cycle.firstEnd) : undefined,
                2: cycle.secondStart ? fmtRange(cycle.secondStart, cycle.secondEnd) : undefined,
              }}
            />
            {cycle.status === "setup" && (
              <Card>
                <CardContent className="flex items-center justify-between gap-4">
                  <p className="text-body text-text-secondary">안내 이메일을 보내면 개인작성 기간이 열립니다.</p>
                  <Link className={buttonVariants({ variant: "outline" })} href="/admin/setup">
                    평가 시작 설정
                  </Link>
                </CardContent>
              </Card>
            )}
            {showInvite && batchId && progress && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Mail className="size-4 text-muted-foreground" aria-hidden="true" />
                    안내 이메일
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <BatchProgress batchId={batchId} initial={progress} />
                </CardContent>
              </Card>
            )}
          </>
        )}
      </main>
    </>
  );
}
