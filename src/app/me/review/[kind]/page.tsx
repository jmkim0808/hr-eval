import { CircleCheck, Clock, FilePen } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtRange } from "@/domain/periods";
import { REVIEW, type ReviewKind } from "@/domain/review";
import { requireParticipant } from "@/server/authz/actor";
import { reviewOverview, type OverviewScores } from "@/server/repo/reviews";

export const dynamic = "force-dynamic";

const f1 = (n: number | null) => (n === null ? "—" : n.toFixed(1));

/** 내 평가 현황 (2026-10-15 피드백). 팀장은 2차 점수를 볼 수 없다 — 데이터 자체를 받지 않는다 */
export default async function ReviewOverviewPage({ params, searchParams }: { params: Promise<{ kind: string }>; searchParams: Promise<{ done?: string }> }) {
  const a = await requireParticipant();
  const { kind: k } = await params;
  if (!(k in REVIEW)) notFound();
  const kind = k as ReviewKind;
  const { group, rows } = await reviewOverview(a, kind);
  const def = REVIEW[kind];
  const done = rows.filter((r) => r.status === "done").length;
  const showSecond = kind === "second";
  const firstLabel = kind === "leader" ? "임원" : "1차";
  const sp = await searchParams;

  const cells = (s: OverviewScores, strong: boolean) => (
    <>
      <TableCell className="text-right tabular-nums">{f1(s.competency)}</TableCell>
      <TableCell className="text-right tabular-nums">{f1(s.achievement)}</TableCell>
      <TableCell className={strong ? "text-right font-semibold tabular-nums" : "text-right tabular-nums"}>{s.total === null ? "—" : s.total.toFixed(2)}</TableCell>
    </>
  );

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-8 py-6">
      <PageHeader title={`내 평가 현황 · ${def.label}`} description={`${def.windowLabel} 기간 ${fmtRange(group.range[0], group.range[1])} · ${rows.length}명 중 ${done}명 제출`} />
      {sp.done === "1" && done === rows.length && (
        <Alert variant="success" data-testid="all-done">
          <CircleCheck aria-hidden="true" />
          <AlertDescription>맡은 {rows.length}명을 모두 제출했습니다. 기간 안에는 이름을 눌러 고쳐서 다시 제출할 수 있습니다.</AlertDescription>
        </Alert>
      )}
      <Card className="pb-0">
        <Table data-testid="overview-table">
          <TableHeader>
            <TableRow>
              <TableHead rowSpan={2}>이름</TableHead>
              <TableHead rowSpan={2}>부서 · 직급</TableHead>
              <TableHead rowSpan={2}>본인평가</TableHead>
              <TableHead colSpan={3} className="text-center">
                {firstLabel} 평가
              </TableHead>
              {showSecond && (
                <TableHead colSpan={3} className="text-center">
                  2차 평가
                </TableHead>
              )}
              <TableHead rowSpan={2} className="text-right">
                가점
              </TableHead>
              <TableHead rowSpan={2}>상태</TableHead>
            </TableRow>
            <TableRow>
              {(showSecond ? [0, 1] : [0]).map((i) => (
                <FragmentHead key={i} />
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} data-person={r.name}>
                <TableCell className="font-medium">
                  <Link href={`/me/review/${kind}/${r.id}`} className="underline-offset-4 hover:underline">
                    {r.name}
                  </Link>
                </TableCell>
                <TableCell>
                  {r.department || "—"} · {r.position}
                </TableCell>
                <TableCell>{r.selfSubmitted ? <Badge variant="success">제출</Badge> : <Badge variant="secondary">미제출</Badge>}</TableCell>
                {cells(r.first, kind !== "second")}
                {showSecond && r.second && cells(r.second, true)}
                <TableCell className="text-right tabular-nums" data-bonus title={r.bonus?.items.map((i) => `${i.label} ${i.points}`).join(" · ")}>
                  {r.bonus ? r.bonus.total.toFixed(2).replace(/\.?0+$/, "") || "0" : "—"}
                </TableCell>
                <TableCell>
                  <Status status={r.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <p className="text-caption text-muted-foreground">
        역량 = 항목 점수 합계(100점 만점) · 업적 = 업적 점수(10점 만점) · 점수 = 역량×30% + 업적×70% (100점 만점) · 가점은 잠정치이며 최종점수에 더해집니다(— = 아직 안 들어옴)
        {kind === "first" && " · 2차(임원) 평가는 볼 수 없습니다"}
      </p>
    </main>
  );
}

function FragmentHead() {
  return (
    <>
      <TableHead className="text-right">역량</TableHead>
      <TableHead className="text-right">업적</TableHead>
      <TableHead className="text-right">점수</TableHead>
    </>
  );
}

function Status({ status }: { status: "todo" | "writing" | "done" }) {
  if (status === "done")
    return (
      <span className="flex items-center gap-1 text-label text-success">
        <CircleCheck className="size-3.5" aria-hidden="true" />
        제출
      </span>
    );
  if (status === "writing")
    return (
      <span className="flex items-center gap-1 text-label text-info">
        <FilePen className="size-3.5" aria-hidden="true" />
        작성 중
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-label text-muted-foreground">
      <Clock className="size-3.5" aria-hidden="true" />
      미평가
    </span>
  );
}
