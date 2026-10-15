import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { CommentsCard } from "@/components/CommentsCard";
import { PageHeader } from "@/components/PageHeader";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ACHIEVEMENT } from "@/domain/review";
import { isUuid } from "@/lib/utils";
import { requireParticipant } from "@/server/authz/actor";
import { getHistoryRecord } from "@/server/repo/history";

const f2 = (n: number | null) => (n === null ? "—" : n.toFixed(2));
const pts = (n: number) => (n === 0 ? "0" : n.toFixed(2).replace(/\.?0+$/, ""));
const sc = (x: number | undefined) => (x === undefined ? "—" : String(x));

// 지난 평가 한 사람 (보기 전용). 무엇을 보여 줄지는 repo/history.ts가 역할(본인·1차·2차)에 따라 이미 걸러 준다.
export default async function HistoryRecordPage({ params }: { params: Promise<{ personId: string }> }) {
  const a = await requireParticipant();
  const { personId } = await params;
  if (!isUuid(personId)) notFound();
  const r = await getHistoryRecord(a, personId);
  const leader = r.person.formType === "leader";
  const firstLabel = leader ? "임원" : "1차";
  const comps = r.items;
  const roleLabel = r.role === "self" ? "본인" : leader ? "팀장 평가(임원)" : r.role === "first" ? "1차 평가자" : "2차 평가자";
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-8 py-6">
      <PageHeader
        title={`${r.year}년 평가 기록 · ${r.person.name}`}
        description={`${r.person.department || "—"} · ${r.person.position} · ${roleLabel}로 보기 · 보기 전용 · 대외비`}
        actions={
          <Link href="/me/history" className={buttonVariants({ variant: "outline" })}>
            <ArrowLeft aria-hidden="true" />
            지난 평가 기록
          </Link>
        }
      />
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-12 gap-y-4" data-testid="history-result">
          <Stat label="평가등급" value={r.result.grade ?? "—"} big />
          {r.result.percentile !== null && <Stat label="그룹 내 위치" value={`상위 ${r.result.percentile.toFixed(1)}%`} />}
          <Stat label="최종점수" value={f2(r.result.final)} />
          <Stat label={`${firstLabel} 점수`} value={f2(r.firstTotal)} />
          {!leader && r.role !== "first" && <Stat label="2차 점수" value={f2(r.secondTotal)} />}
          <Stat label="가점" value={pts(r.result.bonusTotal)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>업적 (본인 작성)</CardTitle>
          <CardDescription>{r.self.submitted ? "제출한 평가지" : "제출하지 않은 평가지"}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4" data-testid="history-achievement">
          <Text title={`${r.year}년 개인역할 및 업적`} text={r.self.achievement} />
          <Text title={`${r.year + 1}년 개선 및 발전`} text={r.self.improvement} />
        </CardContent>
      </Card>

      <Card className="pb-0">
        <CardHeader>
          <CardTitle>항목별 점수</CardTitle>
          <CardDescription>{r.role === "self" ? "본인평가 점수 (평가자 점수는 위 합계로만 보입니다)" : "본인평가와 평가자 점수"}</CardDescription>
        </CardHeader>
        <Table data-testid="history-scores">
          <TableHeader>
            <TableRow>
              <TableHead>항목</TableHead>
              <TableHead className="text-right">본인</TableHead>
              {r.firstScores && <TableHead className="text-right">{firstLabel}</TableHead>}
              {r.secondScores && <TableHead className="text-right">2차</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {comps.map((it) => (
              <TableRow key={it.code}>
                <TableCell>{it.name}</TableCell>
                <TableCell className="text-right tabular-nums">{sc(r.self.scores[it.code])}</TableCell>
                {r.firstScores && <TableCell className="text-right tabular-nums">{sc(r.firstScores[it.code])}</TableCell>}
                {r.secondScores && <TableCell className="text-right tabular-nums">{sc(r.secondScores[it.code])}</TableCell>}
              </TableRow>
            ))}
            {(r.firstScores || r.secondScores) && (
              <TableRow>
                <TableCell className="font-medium">업적</TableCell>
                <TableCell className="text-right">—</TableCell>
                {r.firstScores && <TableCell className="text-right tabular-nums">{sc(r.firstScores[ACHIEVEMENT])}</TableCell>}
                {r.secondScores && <TableCell className="text-right tabular-nums">{sc(r.secondScores[ACHIEVEMENT])}</TableCell>}
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <CommentsCard items={[{ title: `${firstLabel} 평가의견`, text: r.firstComment }, ...(r.secondComment === null ? [] : [{ title: "2차 평가의견", text: r.secondComment }])]} />

      <Card className="pb-0">
        <CardHeader>
          <CardTitle>가점 항목별</CardTitle>
        </CardHeader>
        <Table>
          <TableBody>
            {r.result.bonus.map((b) => (
              <TableRow key={b.label}>
                <TableCell>{b.label}</TableCell>
                <TableCell className="text-right tabular-nums">{pts(b.points)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </main>
  );
}

function Stat({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className="text-caption text-muted-foreground">{label}</span>
      <span className={big ? "mt-1 flex size-14 items-center justify-center rounded-lg bg-accent text-page-title font-bold text-accent-foreground" : "text-section-title font-bold tabular-nums"}>{value}</span>
    </div>
  );
}

function Text({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-caption font-medium text-text-secondary">{title}</span>
      <p className="min-h-20 whitespace-pre-wrap rounded-md border bg-muted/40 px-3 py-2 text-body">{text || <span className="text-muted-foreground">(빈칸)</span>}</p>
    </div>
  );
}
