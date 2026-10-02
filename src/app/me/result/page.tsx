import { Hourglass } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireParticipant } from "@/server/authz/actor";
import { getMyResult } from "@/server/repo/results";

const f2 = (n: number) => n.toFixed(2);
const pts = (n: number) => (n === 0 ? "0" : n.toFixed(2).replace(/\.?0+$/, ""));

// 내 평가결과 (S04). 등급조정 여부는 어떤 말로도 보이지 않는다.
export default async function MyResultPage() {
  const a = await requireParticipant();
  const r = await getMyResult(a);
  if (r.status !== "ok")
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-8 py-6">
        <PageHeader title="내 평가결과" />
        <Card>
          <Empty icon={<Hourglass aria-hidden="true" />} title="아직 결과가 나오지 않았습니다">
            결과가 나오면 이메일로 알려 드립니다.
          </Empty>
        </Card>
      </main>
    );
  const x = r.result;
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-8 py-6">
      <PageHeader title="내 평가결과" description={`${x.year}년 정기평가 · ${x.name} · 대외비이므로 다른 사람에게 보여 주지 마세요`} />
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-12 gap-y-4">
          <div className="flex flex-col">
            <span className="text-caption text-muted-foreground">평가등급</span>
            <span className="mt-1 flex size-14 items-center justify-center rounded-lg bg-accent text-page-title font-bold text-accent-foreground" data-testid="my-grade">
              {x.grade}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-caption text-muted-foreground">그룹 내 위치</span>
            <span className="text-page-title font-bold tabular-nums" data-testid="my-percentile">
              상위 {x.percentile.toFixed(1)}%
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-caption text-muted-foreground">최종점수</span>
            <span className="text-page-title font-bold tabular-nums" data-testid="my-final">
              {f2(x.final)}
            </span>
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="gap-1 px-5">
          <span className="text-caption text-muted-foreground">{x.isLeader ? "1차 점수 (임원)" : "1차 점수"}</span>
          <span className="text-section-title font-bold tabular-nums">{x.first === null ? "—" : f2(x.first)}</span>
        </Card>
        <Card className="gap-1 px-5">
          <span className="text-caption text-muted-foreground">2차 점수</span>
          <span className="text-section-title font-bold tabular-nums">{x.second === null ? "해당 없음" : f2(x.second)}</span>
        </Card>
        <Card className="gap-1 px-5">
          <span className="text-caption text-muted-foreground">가점 합계</span>
          <span className="text-section-title font-bold tabular-nums">{pts(x.bonusTotal)}</span>
        </Card>
      </div>
      <Card className="pb-0">
        <CardHeader>
          <CardTitle>가점 항목별</CardTitle>
          <CardDescription>징계사항은 감점입니다</CardDescription>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>항목</TableHead>
              <TableHead className="text-right">점수</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {x.bonus.map((b) => (
              <TableRow key={b.label}>
                <TableCell>{b.label}</TableCell>
                <TableCell className="text-right tabular-nums">{pts(b.points)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <p className="text-caption text-muted-foreground">
        1차·2차 점수는 각 평가자 점수로 낸 역량×30% + 업적×70%입니다. 최종점수 = 역량(1차 60% + 2차 40%)×30% + 업적×70% + 가점. 궁금한 점은 메일이나 면담으로 문의해 주세요.
      </p>
    </main>
  );
}
