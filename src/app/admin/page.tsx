import Link from "next/link";
import { ClipboardList, Mail, Users } from "lucide-react";
import { AdminNav } from "@/components/AdminNav";
import { BatchProgress } from "@/components/BatchProgress";
import { PageHeader } from "@/components/PageHeader";
import { StageBar } from "@/components/StageBar";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Empty } from "@/components/ui/empty";
import { fmtDay, fmtRange } from "@/domain/periods";
import { seoulToday } from "@/lib/time";
import { requireAdmin } from "@/server/authz/actor";
import { getCurrentCycle, latestBatch, NEXT_STAGE, STAGE_LABEL } from "@/server/repo/cycles";
import { batchProgress } from "@/server/repo/outbox";
import { stageProgress } from "@/server/repo/progress";
import { AdvanceButton } from "./AdvanceButton";
import { PendingTable } from "./PendingTable";

const STAGE_COPY: Record<string, { title: string; end: (c: { selfEnd: string | null; firstEnd: string | null; secondEnd: string | null }) => string | null; hint: string }> = {
  self_review: { title: "평가지 제출", end: (c) => c.selfEnd, hint: "이름을 누르면 쓰던 평가지를 보기 전용으로 엽니다" },
  first_review: { title: "1차 평가 제출", end: (c) => c.firstEnd, hint: "남은 평가가 있는 팀장입니다" },
  second_review: { title: "2차 평가·팀장 평가 제출", end: (c) => c.secondEnd, hint: "남은 평가가 있는 임원입니다" },
};

export default async function ProgressPage() {
  const a = await requireAdmin();
  const cycle = await getCurrentCycle(a);
  const batchId = cycle ? await latestBatch(a, cycle.id, "invite") : null;
  const progress = batchId ? await batchProgress(a, batchId) : null;
  const showInvite = !!progress && (progress.pending > 0 || progress.failed > 0);
  const remindId = cycle ? await latestBatch(a, cycle.id, "reminder") : null;
  const remind = remindId ? await batchProgress(a, remindId) : null;
  const stage = cycle ? await stageProgress(a, cycle.id, cycle.status) : null;
  const stageCopy = cycle ? STAGE_COPY[cycle.status] : undefined;
  const today = seoulToday();
  const end = cycle ? { self_review: cycle.selfEnd, first_review: cycle.firstEnd, second_review: cycle.secondEnd }[cycle.status as string] : null;
  const overdue = !!end && today > end;

  return (
    <>
      <AdminNav current="/admin" />
      <main className="flex flex-col gap-6 px-8 py-6">
        <PageHeader
          title="진행 현황"
          description={cycle ? `${cycle.year}년 정기평가 · 지금 누가 어디서 멈춰 있는지 봅니다` : "지금 누가 어디서 멈춰 있는지 봅니다"}
          actions={
            cycle && cycle.status in NEXT_STAGE ? (
              <AdvanceButton
                from={cycle.status as keyof typeof NEXT_STAGE}
                version={cycle.version}
                fromLabel={STAGE_LABEL[cycle.status]!}
                toLabel={STAGE_LABEL[NEXT_STAGE[cycle.status as keyof typeof NEXT_STAGE]]!}
                pendingNames={stage?.pending.map((p) => p.name) ?? []}
              />
            ) : undefined
          }
        />
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
              overdue={overdue}
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
            {stage && (
              <>
                <Card>
                  <CardContent className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="flex items-center gap-2 font-semibold">
                        <Users className="size-4 text-muted-foreground" aria-hidden="true" />
                        {stageCopy?.title}
                      </span>
                      <span className="text-section-title font-bold tabular-nums" data-testid="submitted-count">
                        {stage.submitted} / {stage.total}
                      </span>
                    </div>
                    <Progress value={stage.total ? (stage.submitted / stage.total) * 100 : 0} aria-label="평가지 제출" />
                  </CardContent>
                </Card>
                <Card className="pb-0">
                  <CardHeader>
                    <CardTitle>미제출 {stage.pending.length}명</CardTitle>
                    <CardDescription>
                      마감 {fmtDay(stageCopy?.end(cycle))} · 기한이 지나도 저절로 잠기지 않습니다 · {stageCopy?.hint}
                    </CardDescription>
                  </CardHeader>
                  <PendingTable rows={stage.pending} canRemind />
                </Card>
                {remindId && remind && (remind.pending > 0 || remind.failed > 0) && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Mail className="size-4 text-muted-foreground" aria-hidden="true" />
                        독촉 이메일
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <BatchProgress batchId={remindId} initial={remind} />
                    </CardContent>
                  </Card>
                )}
              </>
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
