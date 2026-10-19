import Link from "next/link";
import { CalendarClock, ClipboardList, Mail, Medal, Users } from "lucide-react";
import { BatchProgress } from "@/components/BatchProgress";
import { PageHeader } from "@/components/PageHeader";
import { StageBar } from "@/components/StageBar";
import { StatCard } from "@/components/StatCard";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Empty } from "@/components/ui/empty";
import { fmtDay, fmtRange } from "@/domain/periods";
import { daysLeft, seoulToday } from "@/lib/time";
import { requireAdmin } from "@/server/authz/actor";
import { getCurrentCycle, latestBatch, NEXT_STAGE, PREV_STAGE, STAGE_LABEL } from "@/server/repo/cycles";
import { batchProgress } from "@/server/repo/outbox";
import { BackupButton, BackupNotice } from "@/components/ExportButtons";
import { bonusCount } from "@/server/repo/bonus";
import { backupDue } from "@/server/repo/export";
import { deptProgress, stageProgress } from "@/server/repo/progress";
import { adminOverview } from "@/server/repo/overview";
import { NineBox } from "@/components/NineBox";
import { retentionUntil } from "@/server/repo/results";
import { AdvanceButton } from "./AdvanceButton";
import { RollbackButton } from "./RollbackButton";
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
  const due = cycle ? await backupDue(a, cycle.id) : false;
  const bonus = cycle && cycle.status !== "setup" ? { n: await bonusCount(a, cycle.id), total: (await stageProgress(a, cycle.id, "self_review"))?.total ?? 0 } : null;
  const today = seoulToday();
  const end = cycle ? { self_review: cycle.selfEnd, first_review: cycle.firstEnd, second_review: cycle.secondEnd }[cycle.status as string] : null;
  const overdue = !!end && today > end;
  const left = end ? daysLeft(end, today) : null;
  const depts = cycle ? await deptProgress(a, cycle.id, cycle.status) : [];
  const nine = cycle && ["first_review", "second_review", "final_review", "confirmed", "results_sent", "closed"].includes(cycle.status)
    ? (await adminOverview(a, cycle.id)).filter((p) => p.first.competency !== null && p.first.achievement !== null).map((p) => ({ name: p.name, department: p.department, competency: p.first.competency!, achievement: p.first.achievement! }))
    : [];

  return (
    <>
      <main className="flex flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8">
        <PageHeader
          title="진행 현황"
          description={cycle ? `${cycle.year}년 정기평가 · 지금 누가 어디서 멈춰 있는지 봅니다` : "지금 누가 어디서 멈춰 있는지 봅니다"}
          actions={
            cycle && (cycle.status in NEXT_STAGE || cycle.status in PREV_STAGE) ? (
              <>
                {cycle.status in PREV_STAGE && (
                  <RollbackButton
                    from={cycle.status as keyof typeof PREV_STAGE}
                    version={cycle.version}
                    fromLabel={STAGE_LABEL[cycle.status]!}
                    toLabel={STAGE_LABEL[PREV_STAGE[cycle.status as keyof typeof PREV_STAGE]]!}
                  />
                )}
                {cycle.status in NEXT_STAGE && (
              <AdvanceButton
                from={cycle.status as keyof typeof NEXT_STAGE}
                version={cycle.version}
                fromLabel={STAGE_LABEL[cycle.status]!}
                toLabel={STAGE_LABEL[NEXT_STAGE[cycle.status as keyof typeof NEXT_STAGE]]!}
                pendingNames={stage?.pending.map((p) => p.name) ?? []}
              />
                )}
              </>
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
            {due && <BackupNotice />}
            {cycle.status === "closed" && cycle.closedAt && (
              <Card>
                <CardContent className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-subsection-title font-bold" data-testid="closed-line">
                    {cycle.year}년 정기평가 마감 ({fmtDay(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(cycle.closedAt))}, {cycle.closedBy})
                  </span>
                  <span className="text-caption text-muted-foreground" data-testid="retention">
                    보관 기한 {retentionUntil(cycle.closedAt)} (마감 + 3년) · 이 평가는 보기 전용 기록입니다
                  </span>
                </CardContent>
              </Card>
            )}
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
            {(stage || bonus) && (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {stage && (
                  <StatCard
                    label={stageCopy?.title ?? "제출"}
                    icon={<Users aria-hidden="true" />}
                    hue="blue"
                    value={
                      <span data-testid="submitted-count">
                        {stage.submitted} <span className="text-section-title font-semibold text-muted-foreground">/ {stage.total}</span>
                      </span>
                    }
                    foot={<Progress value={stage.total ? (stage.submitted / stage.total) * 100 : 0} aria-label="평가지 제출" className="mt-1" />}
                  />
                )}
                {stage && (
                  <StatCard
                    label="미제출"
                    icon={<ClipboardList aria-hidden="true" />}
                    hue="orange"
                    value={`${stage.pending.length}명`}
                    tone={stage.pending.length && overdue ? "warning" : undefined}
                    foot={stageCopy?.hint}
                  />
                )}
                {stage && (
                  <StatCard
                    label="마감"
                    icon={<CalendarClock aria-hidden="true" />}
                    hue="violet"
                    value={left === null ? "—" : left >= 0 ? `D-${left}` : `${-left}일 지남`}
                    tone={left !== null && left < 0 ? "warning" : undefined}
                    foot={`${fmtDay(stageCopy?.end(cycle))}까지`}
                  />
                )}
                {bonus && (
                  <StatCard
                    label="가점 반영"
                    icon={<Medal aria-hidden="true" />}
                    hue="green"
                    value={
                      <span data-testid="bonus-count">
                        <span className="sr-only">가점 반영 </span>
                        {bonus.n} <span className="text-section-title font-semibold text-muted-foreground">/ {bonus.total}</span>
                      </span>
                    }
                    foot={
                      <Link className="font-semibold text-brand hover:underline" href="/admin/bonus">
                        가점 입력 →
                      </Link>
                    }
                  />
                )}
              </div>
            )}
            {(depts.length > 0 || nine.length > 0) && (
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
                {depts.length > 0 && (
                  <Card className="gap-3 px-6" data-testid="dept-progress">
                    <div>
                      <h2 className="text-subsection-title font-bold">부서별 {stageCopy?.title ?? "진행"}</h2>
                      <p className="text-caption text-muted-foreground">진행이 빠른 부서부터 · 막대에 마우스를 올리면 남은 사람 수</p>
                    </div>
                    <ul className="flex flex-col gap-1.5">
                      {depts.map((d) => {
                        const pct = Math.round((d.done / d.total) * 100);
                        return (
                          <li key={d.department} className="grid grid-cols-[6.5rem_minmax(0,1fr)_3.5rem] items-center gap-3 text-body" title={`${d.department} · ${d.done}/${d.total}명 · 남은 ${d.total - d.done}명`}>
                            <span className="truncate">{d.department}</span>
                            <span className="h-2.5 overflow-hidden rounded-full bg-muted">
                              <span className="block h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                            </span>
                            <span className="text-right font-semibold tabular-nums">{pct}%</span>
                          </li>
                        );
                      })}
                    </ul>
                  </Card>
                )}
                {nine.length > 0 && (
                  <Card className="gap-3 px-6">
                    <div>
                      <h2 className="text-subsection-title font-bold">역량 × 업적 9칸 표</h2>
                      <p className="text-caption text-muted-foreground">1차 점수 기준 · 점 하나 = 한 사람({nine.length}명) · 점에 마우스를 올리면 이름 · 관리자·대표이사에게만 보입니다</p>
                    </div>
                    <NineBox people={nine} />
                  </Card>
                )}
              </div>
            )}
            {stage && (
              <>
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
        {cycle && (
          <div className="flex items-center justify-end gap-3 border-t pt-4">
            <span className="text-caption text-muted-foreground">명단·평가지·점수·가점·최종평가·등급조정 이력</span>
            <BackupButton />
          </div>
        )}
      </main>
    </>
  );
}
