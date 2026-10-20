import { CalendarClock, CircleCheck, ClipboardPen, Clock, FilePen, Medal, Target, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { buttonVariants } from "@/components/ui/button";
import { ScoreStrip } from "@/components/ScoreStrip";
import { StatCard } from "@/components/StatCard";
import { daysLeft, seoulToday } from "@/lib/time";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDay, fmtRange } from "@/domain/periods";
import { AVG_MIN_PEOPLE, AVG_RANGE, AVG_TARGET, AVG_TOLERANCE, REVIEW, type ReviewKind } from "@/domain/review";
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
  const mine = rows.map((r) => ({ name: r.name, total: (kind === "second" ? r.second?.total : r.first.total) ?? null })).filter((r): r is { name: string; total: number } => r.total !== null);
  const myAvg = mine.length ? mine.reduce((x, r) => x + r.total, 0) / mine.length : null;
  const left = group.range[1] ? daysLeft(group.range[1], seoulToday()) : null;
  const bonusIn = rows.filter((r) => r.bonus).length;

  const cells = (s: OverviewScores, strong: boolean) => (
    <>
      <TableCell className="text-right tabular-nums">{f1(s.competency)}</TableCell>
      <TableCell className="text-right tabular-nums">{f1(s.achievement)}</TableCell>
      <TableCell className={strong ? "text-right font-semibold tabular-nums" : "text-right tabular-nums"}>{s.total === null ? "—" : s.total.toFixed(2)}</TableCell>
    </>
  );

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8">
      <PageHeader
        back={{ href: "/me", label: "내 할 일" }}
        title={`내 평가 현황 · ${def.label}`}
        description={`${def.windowLabel} 기간 ${fmtRange(group.range[0], group.range[1])} · ${rows.length}명 중 ${done}명 제출`}
        actions={
          rows.length > 0 ? (
            <Link href={`/me/review/${kind}/${(rows.find((r) => r.status !== "done") ?? rows[0]!).id}`} className={buttonVariants()} data-testid="back-to-review">
              <ClipboardPen aria-hidden="true" />
              {done < rows.length ? "이어서 평가하기" : "평가 화면으로"}
            </Link>
          ) : undefined
        }
      />
      {sp.done === "1" && done === rows.length && (
        <Alert variant="success" data-testid="all-done">
          <CircleCheck aria-hidden="true" />
          <AlertDescription>맡은 {rows.length}명을 모두 제출했습니다. 고치려면 이름을 눌러 [제출 취소] 뒤 고쳐서 다시 제출하세요 (기간 안에서만).</AlertDescription>
        </Alert>
      )}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="제출" icon={<Users aria-hidden="true" />} hue="blue" value={<>{done} <span className="text-section-title font-semibold text-muted-foreground">/ {rows.length}</span></>} foot={`작성 중 ${rows.filter((r) => r.status === "writing").length} · 시작 전 ${rows.filter((r) => r.status === "todo").length}`} />
        <StatCard label="내 평균" icon={<Target aria-hidden="true" />} hue="violet" value={myAvg === null ? "—" : myAvg.toFixed(1)} foot={rows.length < AVG_MIN_PEOPLE ? "1명은 평균 규칙 없음" : myAvg === null ? `기준 ${AVG_RANGE}` : `기준 ${AVG_RANGE} · ${Math.abs(myAvg - AVG_TARGET) <= AVG_TOLERANCE + 1e-9 ? "기준 안" : `지금 ${(myAvg - 80 > 0 ? "+" : "") + (myAvg - 80).toFixed(1)}`}`} />
        <StatCard label="마감" icon={<CalendarClock aria-hidden="true" />} hue="orange" value={left === null ? "—" : left >= 0 ? `D-${left}` : `${-left}일 지남`} foot={group.range[1] ? `${fmtDay(group.range[1])}까지` : undefined} />
        <StatCard label="가점 들어옴" icon={<Medal aria-hidden="true" />} hue="green" value={<>{bonusIn} <span className="text-section-title font-semibold text-muted-foreground">/ {rows.length}</span></>} foot="잠정치 · 바로 반영" />
      </div>
      {mine.length > 0 && (
        <Card className="gap-2 px-6">
          <div>
            <h2 className="text-subsection-title font-bold">내가 준 점수 분포</h2>
            <p className="text-caption text-muted-foreground">점 하나가 한 사람 · 초록 띠가 평균 기준({AVG_RANGE}) · 점에 마우스를 올리면 점수</p>
          </div>
          <ScoreStrip people={mine} />
        </Card>
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
              <TableHead rowSpan={2}>제출 일시</TableHead>
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
                  {r.pay && <span className="block text-label text-muted-foreground">{r.pay}</span>}
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
                <TableCell className="text-caption tabular-nums text-text-secondary" data-submitted-at>
                  {r.submittedAt ? new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Seoul" }).format(new Date(r.submittedAt)) : "—"}
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
