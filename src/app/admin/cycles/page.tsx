import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtRange } from "@/domain/periods";
import { seoulYear } from "@/lib/time";
import { requireAdmin } from "@/server/authz/actor";
import { listCycles } from "@/server/repo/cycles";
import { retentionUntil } from "@/server/repo/results";
import { CreateCycle } from "./CreateCycle";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = { setup: "준비 중", self_review: "개인작성", first_review: "1차평가", second_review: "2차평가", final_review: "최종평가", confirmed: "확정", results_sent: "결과 발송", closed: "마감" };

/** 평가 관리 (2026-10-15 피드백): 해마다 새 정기평가를 만들고 지난 평가를 본다 */
export default async function CyclesPage() {
  const a = await requireAdmin();
  const cycles = await listCycles(a);
  const open = cycles.find((c) => c.status !== "closed");
  const next = Math.max(seoulYear(), (cycles[0]?.year ?? seoulYear() - 1) + 1);
  return (
    <>
      <main className="flex flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8">
        <PageHeader title="평가 관리" description="해마다 정기평가를 새로 만들고, 지난 평가는 보기 전용으로 남깁니다 (마감일로부터 3년 보관)" />
        <Card>
          <CardHeader>
            <CardTitle>새 정기평가</CardTitle>
            <CardDescription>만들면 [평가 시작 설정]에서 명단·기간·안내 메일을 준비합니다. 진행 중인 평가를 마감해야 새로 만들 수 있습니다.</CardDescription>
          </CardHeader>
          <CardContent>
            <CreateCycle defaultYear={open ? open.year + 1 : next} blocked={open ? `${open.year}년 정기평가가 진행 중입니다 (${STATUS[open.status]}). 마감한 뒤에 만들 수 있습니다.` : null} />
          </CardContent>
        </Card>
        <Card className="pb-0">
          <CardHeader>
            <CardTitle>정기평가 {cycles.length}건</CardTitle>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>연도</TableHead>
                <TableHead>단계</TableHead>
                <TableHead>대상자</TableHead>
                <TableHead>개인작성 ~ 2차평가</TableHead>
                <TableHead>마감</TableHead>
                <TableHead>보관 기한</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {cycles.map((c) => (
                <TableRow key={c.id} data-year={c.year}>
                  <TableCell className="font-semibold">{c.year}년</TableCell>
                  <TableCell>
                    <Badge variant={c.status === "closed" ? "secondary" : "info"}>{STATUS[c.status]}</Badge>
                  </TableCell>
                  <TableCell className="tabular-nums">{c.targets}명</TableCell>
                  <TableCell className="tabular-nums">{c.selfStart ? `${fmtRange(c.selfStart, c.selfEnd)} ~ ${fmtRange(c.secondStart, c.secondEnd)}` : "—"}</TableCell>
                  <TableCell>{c.closedAt ? `${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(c.closedAt)} (${c.closedBy})` : "—"}</TableCell>
                  <TableCell className="tabular-nums">{c.closedAt ? retentionUntil(c.closedAt) : "—"}</TableCell>
                  <TableCell className="text-right">
                    <Link href={c.status === "closed" ? `/admin/cycles/${c.year}` : "/admin"} className="text-brand underline-offset-4 hover:underline">
                      {c.status === "closed" ? "지난 평가 보기" : "진행 현황"}
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </main>
    </>
  );
}
