import Link from "next/link";
import { ArrowDownUp, Equal, Hourglass, TriangleAlert } from "lucide-react";
import { AdminNav } from "@/components/AdminNav";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { GRADES, GROUP_LABEL, gradeCounts, type Grade } from "@/domain/grading";
import { cn } from "@/lib/utils";
import { requireAdmin } from "@/server/authz/actor";
import { getCurrentCycle } from "@/server/repo/cycles";
import { listFinal, remainingBeforeFinal } from "@/server/repo/final";
import { ChangeBadge, GradeCell, RevertButton } from "./GradeCell";

const fmt = (n: number | null) => (n === null ? "—" : n.toFixed(2));
const AFTER = ["final_review", "confirmed", "results_sent", "closed"];

export default async function FinalPage({ searchParams }: { searchParams: Promise<{ group?: string }> }) {
  const a = await requireAdmin();
  const cycle = await getCurrentCycle(a);
  const ready = !!cycle && AFTER.includes(cycle.status);
  const rows = ready ? await listFinal(a, cycle!.id) : [];
  const remain = cycle && !ready ? await remainingBeforeFinal(a, cycle.id) : 0;
  const groups = [...new Set(rows.map((r) => r.group))].sort();
  const sp = await searchParams;
  const group = Number(sp.group) || groups[0] || 5;
  const list = rows.filter((r) => r.group === group);
  const counts = gradeCounts(list.length);
  const blanks = rows.filter((r) => r.blank).length;
  const editable = cycle?.status === "final_review";
  const actual = Object.fromEntries(GRADES.map((g) => [g, list.filter((r) => r.grade === g).length])) as Record<Grade, number>;

  return (
    <>
      <AdminNav current="/admin/final" />
      <main className="flex flex-col gap-6 px-8 py-6">
        <PageHeader title="최종평가" description={`${cycle ? `${cycle.year}년 정기평가 · ` : ""}최종점수와 그룹별 상대평가 초안 등급 · 최종점수는 고치지 않습니다`} />
        {!ready ? (
          <Card>
            <Empty icon={<Hourglass aria-hidden="true" />} title={`2차평가가 끝나면 초안이 나옵니다 (남은 인원 ${remain}명)`}>
              진행 현황에서 2차평가를 다음 단계로 넘기면 최종점수와 초안 등급이 계산됩니다.
            </Empty>
          </Card>
        ) : (
          <>
            {blanks > 0 && (
              <div role="alert" className="flex items-center gap-2 rounded-lg bg-warning-bg px-4 py-3 text-body text-warning">
                <TriangleAlert className="size-4" aria-hidden="true" />
                평가자 점수가 빈 사람이 {blanks}명 있습니다. 대신 입력하기 전에는 확정할 수 없습니다.
              </div>
            )}
            <nav aria-label="그룹" className="flex flex-wrap gap-2">
              {groups.map((g) => (
                <Link
                  key={g}
                  href={`/admin/final?group=${g}`}
                  aria-current={g === group ? "page" : undefined}
                  className={cn("rounded-md border px-3 py-1.5 text-caption", g === group ? "border-primary bg-accent font-semibold text-accent-foreground" : "bg-card text-text-secondary hover:bg-muted")}
                >
                  {GROUP_LABEL[g] ?? `${g}그룹`} ({rows.filter((r) => r.group === g).length})
                </Link>
              ))}
            </nav>
            <Card className="pb-0">
              <CardHeader>
                <CardTitle>
                  {GROUP_LABEL[group]} · {list.length}명
                </CardTitle>
                <CardDescription data-testid="grade-counts">
                  등급별 인원 {GRADES.map((g) => `${g} ${counts[g]}`).join(" · ")} (S·A·C·D 반올림, B가 나머지) · 지금 {GRADES.map((g) => `${g} ${actual[g]}`).join(" · ")}
                </CardDescription>
              </CardHeader>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">순위</TableHead>
                    <TableHead>이름</TableHead>
                    <TableHead>부서</TableHead>
                    <TableHead>입사일</TableHead>
                    <TableHead className="text-right">1차 점수</TableHead>
                    <TableHead className="text-right">2차 점수</TableHead>
                    <TableHead className="text-right">가점</TableHead>
                    <TableHead className="text-right">최종점수</TableHead>
                    <TableHead>초안</TableHead>
                    <TableHead>평가등급</TableHead>
                    <TableHead>표시</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((r, i) => {
                    const cut = i > 0 && !!r.draft && !!list[i - 1]!.draft && list[i - 1]!.draft !== r.draft;
                    return (
                      <TableRow key={r.id} data-person={r.name} className={cn(cut && "border-t-2 border-t-input border-dashed")}>
                        <TableCell className="text-right tabular-nums">{r.rank ?? "—"}</TableCell>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell>{r.department || "—"}</TableCell>
                        <TableCell className="tabular-nums">{r.hireDate}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(r.first)}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.group === 1 ? "—" : fmt(r.second)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(r.bonus)}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{fmt(r.final)}</TableCell>
                        <TableCell>
                          {r.blank ? (
                            <Link href={`/admin/final/fill/${r.id}`} className="rounded-md focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none">
                              <Badge variant="warning" className="underline-offset-2 hover:underline">
                                <TriangleAlert aria-hidden="true" />
                                점수 빈칸 — 대신 입력 필요
                              </Badge>
                            </Link>
                          ) : (
                            <span className="text-text-secondary">{r.draft}</span>
                          )}
                        </TableCell>
                        <TableCell className="py-1.5">{r.grade && <GradeCell personId={r.id} name={r.name} grade={r.grade} version={cycle!.version} editable={editable} />}</TableCell>
                        <TableCell className="flex flex-wrap gap-1.5">
                          {r.recalcFrom && r.draft && (
                            <Badge variant={r.recalcFrom < r.draft ? "grade-down" : "grade-up"}>
                              <ArrowDownUp aria-hidden="true" />
                              다시 계산으로 {r.recalcFrom}→{r.draft}
                            </Badge>
                          )}
                          {r.changeKind !== "none" && r.grade && r.draft && <ChangeBadge kind={r.changeKind} up={GRADES.indexOf(r.grade) < GRADES.indexOf(r.draft)} />}
                          {editable && r.changeKind !== "none" && <RevertButton personId={r.id} version={cycle!.version} />}
                          {r.tieRule && (
                            <Badge variant="grade-rule">
                              <Equal aria-hidden="true" />
                              동점 — 근속으로 하향
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          </>
        )}
      </main>
    </>
  );
}
