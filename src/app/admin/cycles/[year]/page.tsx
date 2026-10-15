import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BackupButton, FinalExcelButton } from "@/components/ExportButtons";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { GROUP_LABEL } from "@/domain/grading";
import { requireAdmin } from "@/server/authz/actor";
import { getCycleDetail } from "@/server/repo/cycles";
import { listFinal } from "@/server/repo/final";
import { retentionUntil } from "@/server/repo/results";

export const dynamic = "force-dynamic";

/** 지난 평가 보기 (보기 전용). 마감된 평가만 */
export default async function PastCyclePage({ params }: { params: Promise<{ year: string }> }) {
  const a = await requireAdmin();
  const year = Number((await params).year);
  if (!Number.isInteger(year)) notFound();
  const c = await getCycleDetail(a, year);
  if (!c || c.status !== "closed") notFound();
  const rows = await listFinal(a, c.id);
  const groups = [...new Set(rows.map((r) => r.group))].sort((x, y) => x - y);
  return (
    <>
      <main className="flex flex-col gap-6 px-8 py-6">
        <Link href="/admin/cycles" className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-3 w-fit" })}>
          <ChevronLeft aria-hidden="true" />
          평가 관리
        </Link>
        <PageHeader
          title={`${year}년 정기평가 (지난 평가)`}
          description={`보기 전용 · 마감 ${c.closedAt ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(c.closedAt) : ""} · 보관 기한 ${c.closedAt ? retentionUntil(c.closedAt) : "—"}`}
          actions={
            <>
              <FinalExcelButton enabled year={year} />
              <BackupButton year={year} />
            </>
          }
        />
        {groups.map((g) => (
          <Card key={g} className="pb-0">
            <CardHeader>
              <CardTitle>
                {GROUP_LABEL[g]} · {rows.filter((r) => r.group === g).length}명
              </CardTitle>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>순위</TableHead>
                  <TableHead>이름</TableHead>
                  <TableHead>부서</TableHead>
                  <TableHead>직급</TableHead>
                  <TableHead className="text-right">1차</TableHead>
                  <TableHead className="text-right">2차</TableHead>
                  <TableHead className="text-right">가점</TableHead>
                  <TableHead className="text-right">최종점수</TableHead>
                  <TableHead>평가등급</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows
                  .filter((r) => r.group === g)
                  .map((r) => (
                    <TableRow key={r.id} data-person={r.name}>
                      <TableCell className="tabular-nums">{r.rank ?? "—"}</TableCell>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell>{r.department || "—"}</TableCell>
                      <TableCell>{r.position}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.first?.toFixed(2) ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.second?.toFixed(2) ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.bonus?.toFixed(2) ?? "—"}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{r.final?.toFixed(2) ?? "—"}</TableCell>
                      <TableCell>{r.grade ? <Badge variant="outline">{r.grade}</Badge> : "—"}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </Card>
        ))}
      </main>
    </>
  );
}
