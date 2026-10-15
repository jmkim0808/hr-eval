import { Hourglass, Info, Lock } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDay } from "@/domain/periods";
import { requireParticipant } from "@/server/authz/actor";
import { getMyBonus } from "@/server/repo/bonus";
import { FixRequest } from "./FixRequest";

const pts = (n: number) => (n === 0 ? "0" : n.toFixed(2).replace(/\.?0+$/, ""));
const when = (iso: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

// 내 가점 (2026-10-15 피드백): 관리자가 넣거나 고치는 즉시 본인과 맡은 1차·2차 평가자에게 보인다.
export default async function MyBonusPage() {
  const a = await requireParticipant();
  const b = await getMyBonus(a);
  if (!b)
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8">
        <PageHeader title="내 가점" />
        <Card>
          <Empty icon={<Hourglass aria-hidden="true" />} title="아직 볼 수 있는 가점이 없습니다">
            평가가 시작되면 이 화면에서 확인할 수 있습니다.
          </Empty>
        </Card>
      </main>
    );
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8">
      <PageHeader title="내 가점" description={`${b.year}년 정기평가 · 가점 인정 기준일 ${fmtDay(b.cutoff)} · 본인만 볼 수 있습니다`} />
      {b.locked ? (
        <Alert variant="neutral">
          <Lock aria-hidden="true" />
          <AlertDescription>평가등급이 확정되어 가점이 최종 반영되었습니다.</AlertDescription>
        </Alert>
      ) : (
        <Alert variant="info">
          <Info aria-hidden="true" />
          <AlertDescription data-testid="bonus-provisional">
            지금 보이는 가점은 <b>잠정치</b>입니다. 1차 취합 뒤 정기포상 등이 끝나면 더해지고, 틀린 곳은 정정되어 바로 이 화면에 반영됩니다. 틀린 곳이 있으면 아래에서 정정을 요청해 주세요.
          </AlertDescription>
        </Alert>
      )}
      {!b.items ? (
        <Card>
          <Empty icon={<Hourglass aria-hidden="true" />} title="아직 가점이 들어오지 않았습니다">
            인사담당자가 가점을 넣으면 바로 여기에 보입니다.
          </Empty>
        </Card>
      ) : (
        <Card className="pb-0">
          <CardHeader>
            <CardTitle>
              가점 합계 <span data-testid="my-bonus-total" className="tabular-nums">{pts(b.total!)}</span>점
            </CardTitle>
            <CardDescription>{b.updatedAt ? `마지막 반영 ${when(b.updatedAt)}` : ""} · 징계사항은 감점으로 합계에서 빠집니다</CardDescription>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>항목</TableHead>
                <TableHead className="text-right">점수</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {b.items.map((i) => (
                <TableRow key={i.code} data-item={i.code}>
                  <TableCell>{i.label}</TableCell>
                  <TableCell className="text-right tabular-nums">{pts(i.points)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      {b.history.length > 0 && (
        <Card className="pb-0">
          <CardHeader>
            <CardTitle>바뀐 기록</CardTitle>
            <CardDescription>가점이 들어오거나 고쳐질 때마다 남습니다</CardDescription>
          </CardHeader>
          <Table data-testid="bonus-history">
            <TableHeader>
              <TableRow>
                <TableHead>언제</TableHead>
                <TableHead>항목</TableHead>
                <TableHead className="text-right">바뀐 내용</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {b.history.map((h, k) => (
                <TableRow key={k}>
                  <TableCell className="tabular-nums">{when(h.at)}</TableCell>
                  <TableCell>{h.label}</TableCell>
                  <TableCell className="text-right tabular-nums">{h.from === null ? `${pts(h.to)} (처음 반영)` : `${pts(h.from)} → ${pts(h.to)}`}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      {!b.locked && (
        <Card>
          <CardContent>
            <FixRequest />
          </CardContent>
        </Card>
      )}
      {b.requests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>내 정정 요청</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-3" data-testid="my-requests">
              {b.requests.map((r) => (
                <li key={r.id} className="flex flex-col gap-1 rounded-md border px-4 py-3">
                  <span className="flex items-center gap-2 text-label text-muted-foreground">
                    {when(r.at)} {r.status === "open" ? <Badge variant="warning">확인 중</Badge> : <Badge variant="success">처리 완료</Badge>}
                  </span>
                  <span className="whitespace-pre-wrap">{r.message}</span>
                  {r.reply && <span className="text-label text-muted-foreground">인사담당자 답변: {r.reply}</span>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
