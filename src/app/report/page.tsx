import Link from "next/link";
import { ArrowDown, ArrowUp, FileBarChart } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { GRADES, GROUP_LABEL, gradeCounts, type Grade } from "@/domain/grading";
import { GradeDist } from "@/components/GradeDist";
import { cn } from "@/lib/utils";
import { requireReportViewer } from "@/server/authz/actor";
import { getReport } from "@/server/repo/report";
import { CeoGradeCell } from "@/components/CeoGradeCell";
import { AutoRefresh } from "./AutoRefresh";

export default async function ReportPage({ searchParams }: { searchParams: Promise<{ group?: string }> }) {
  const a = await requireReportViewer();
  const { cycle, rows } = await getReport(a);
  const sp = await searchParams;
  const groups = rows ? [...new Set(rows.map((r) => r.group))].sort() : [];
  const group = Number(sp.group) || groups[0] || 1;
  const list = rows?.filter((r) => r.group === group) ?? [];
  const count = (g: Grade) => list.filter((r) => r.grade === g).length;
  const editable = cycle?.status === "final_review";

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8">
      <PageHeader title="등급 결과" description={`${cycle ? `${cycle.year}년 정기평가 · ` : ""}${editable ? "대표이사 조정: 등급별 비중과 상관없이 S~D 중 고르면 바로 반영됩니다(다른 사람은 움직이지 않음) · 확정 전까지" : "보기 전용"}`} actions={rows ? <AutoRefresh /> : undefined} />
      {!rows ? (
        <Card>
          <Empty icon={<FileBarChart aria-hidden="true" />} title="아직 보고할 결과가 없습니다">
            2차평가가 끝나고 최종평가가 시작되면 여기에 그룹별 등급이 나옵니다. 그 전에는 위 [진행 현황]에서 누가 어디까지 했는지 볼 수 있습니다.
          </Empty>
        </Card>
      ) : (
        <>
          <nav aria-label="그룹" className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {groups.map((g) => (
              <Link
                key={g}
                href={`/report?group=${g}`}
                aria-current={g === group ? "page" : undefined}
                className={cn(
                  "flex flex-col rounded-lg border px-4 py-3 text-subsection-title font-semibold transition-colors",
                  g === group ? "border-brand/40 bg-accent text-accent-foreground" : "bg-card hover:bg-muted",
                )}
              >
                {GROUP_LABEL[g] ?? `${g}그룹`}
                <span className="text-caption font-normal text-muted-foreground">{rows.filter((r) => r.group === g).length}명</span>
              </Link>
            ))}
          </nav>
          <Card className="gap-3 px-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-subsection-title font-bold">등급 분포 · 기준 대비</h2>
                <p className="text-caption text-muted-foreground">점선 = 상대평가 기준 인원 · 채운 막대 = 지금(대표이사 조정 포함) · 막대에 마우스를 올리면 인원</p>
              </div>
              <span className="flex gap-4 text-label text-text-secondary">
                <span className="inline-flex items-center gap-1.5">
                  <i className="inline-block size-2.5 rounded-[3px] border-[1.5px] border-dashed border-muted-foreground" />
                  기준
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <i className="inline-block size-2.5 rounded-[3px] bg-brand" />
                  지금
                </span>
              </span>
            </div>
            <GradeDist base={gradeCounts(list.filter((r) => r.grade).length)} now={Object.fromEntries(GRADES.map((g) => [g, count(g)])) as Record<Grade, number>} />
          </Card>
          <Card className="pb-0">
            <CardHeader>
              <CardTitle>
                {GROUP_LABEL[group]} · {list.length}명
              </CardTitle>
              <CardDescription data-testid="report-counts">{GRADES.map((g) => `${g} ${count(g)}`).join(" · ")}</CardDescription>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">순위</TableHead>
                  <TableHead>이름</TableHead>
                  <TableHead>부서</TableHead>
                  <TableHead>직급</TableHead>
                  <TableHead className="text-right">최종점수</TableHead>
                  <TableHead>{editable ? "최종 등급 (대표이사 조정)" : "등급"}</TableHead>
                  <TableHead>조정</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((r) => {
                  const ref = r.change === "ceo" ? r.base : r.draft;
                  const up = !!r.grade && !!ref && GRADES.indexOf(r.grade) < GRADES.indexOf(ref);
                  return (
                    <TableRow key={r.id} data-person={r.name}>
                      <TableCell className="text-right tabular-nums">{r.rank ?? "—"}</TableCell>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell>{r.department || "—"}</TableCell>
                      <TableCell>{r.position}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{r.final === null ? "—" : r.final.toFixed(2)}</TableCell>
                      <TableCell className="text-subsection-title font-bold">
                        {editable && r.base ? <CeoGradeCell personId={r.id} name={r.name} value={r.ceo} base={r.base} version={cycle!.version} editable /> : (r.grade ?? "—")}
                      </TableCell>
                      <TableCell>
                        {r.change !== "none" && (
                          <Badge variant={up ? "grade-up" : "grade-down"}>
                            {up ? <ArrowUp aria-hidden="true" /> : <ArrowDown aria-hidden="true" />}
                            {r.change === "ceo" ? `대표 조정 · ${up ? "상향" : "하향"}` : r.change === "adjusted" ? `조정 · ${up ? "상향" : "하향"}` : up ? "올라감 · 상향" : "밀려남 · 하향"}
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
  );
}
