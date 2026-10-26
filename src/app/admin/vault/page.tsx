import { ShieldCheck, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireAdmin } from "@/server/authz/actor";
import { listSlots, recoveryStatus, vaultState } from "@/server/repo/vault";
import { AddSlotForm, LockButton, RecoveryCard, RemoveSlotButton, SetupForm, UnlockForm } from "./VaultForms";

export const dynamic = "force-dynamic";

const day = (d: Date) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium" }).format(d);

/** 보안 열쇠 (ADR-0021): 점수·글·등급을 암호화하는 열쇠. 서버가 다시 켜지면 관리자가 열어야 한다 */
export default async function VaultPage() {
  const a = await requireAdmin({ allowLocked: true });
  const state = await vaultState();
  const slots = state === "open" ? await listSlots(a) : [];
  const rec = await recoveryStatus();
  const passSlots = slots.filter((x) => x.kind === "passphrase").length;
  return (
    <>
      <main className="flex flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8">
        <PageHeader title="보안 열쇠" description="점수·업적 글·가점·등급은 암호로 바꿔 저장합니다 · 서버·DB 관리자도 내용을 읽을 수 없습니다" />

        {state === "unset" && (
          <Card data-vault="unset">
            <CardHeader>
              <CardTitle>처음 한 번: 보안 열쇠 만들기</CardTitle>
              <CardDescription>비밀 문구는 서버 어디에도 저장되지 않습니다. 서버가 다시 켜질 때마다 이 비밀 문구로 열어야 합니다.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Alert variant="warning">
                <ShieldAlert aria-hidden="true" />
                <AlertTitle>잃어버리면 복구할 수 없습니다</AlertTitle>
                <AlertDescription>그래서 만든 뒤 바로 <b>복구 코드</b>를 만들어 인쇄·금고 보관하게 됩니다. 복구 코드를 확인하기 전에는 평가를 시작할 수 없습니다.</AlertDescription>
              </Alert>
              <SetupForm />
            </CardContent>
          </Card>
        )}

        {state === "locked" && (
          <Card data-vault="locked">
            <CardHeader>
              <CardTitle>잠겨 있습니다</CardTitle>
              <CardDescription>서버가 다시 켜져 잠겼습니다. 열기 전까지 직원들은 평가 화면을 쓸 수 없습니다. 비밀 문구를 잊었으면 금고에 보관한 <b>복구 코드</b>를 넣으세요.</CardDescription>
            </CardHeader>
            <CardContent>
              <UnlockForm />
            </CardContent>
          </Card>
        )}

        {state === "open" && (
          <>
            <Alert variant="success" data-vault="open">
              <ShieldCheck aria-hidden="true" />
              <AlertTitle>열려 있습니다</AlertTitle>
              <AlertDescription>
                서버가 꺼질 때까지 열려 있습니다. 평가 기간이 아닐 때는 잠가 두어도 됩니다.
                <LockButton />
              </AlertDescription>
            </Alert>
            <Card data-recovery={rec.ready ? "ready" : "missing"} className={rec.ready ? undefined : "border-danger"}>
              <CardHeader>
                <CardTitle>복구 코드 {!rec.ready && <Badge variant="destructive">필수</Badge>}</CardTitle>
                <CardDescription>비밀 문구를 잊거나 담당자가 바뀌어도 열 수 있는 두 번째 길입니다. 인쇄해 봉인한 뒤 금고에 보관합니다.</CardDescription>
              </CardHeader>
              <CardContent>
                <RecoveryCard ready={rec.ready} confirmedAt={rec.confirmedAt} usedAt={rec.usedAt} me={a.name} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>열쇠 칸 추가</CardTitle>
                <CardDescription>다른 관리자가 자기 비밀 문구로 열 수 있게 합니다. 비밀 문구는 본인이 직접 넣게 해 주세요.</CardDescription>
              </CardHeader>
              <CardContent>
                <AddSlotForm />
              </CardContent>
            </Card>
            <Card className="pb-0">
              <CardHeader>
                <CardTitle>열쇠 칸 {slots.length}개</CardTitle>
                {!rec.ready && <CardDescription>복구 코드가 없습니다. 비밀 문구를 잃어버리면 복구할 수 없으니 위에서 복구 코드를 만들어 주세요.</CardDescription>}
              </CardHeader>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>이름</TableHead>
                    <TableHead>만든 날</TableHead>
                    <TableHead className="text-right" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {slots.map((s) => (
                    <TableRow key={s.id} data-slot-label={s.label}>
                      <TableCell className="font-medium">
                        {s.label} {s.kind === "recovery" ? <Badge variant="teal">복구 코드{s.usedAt ? " · 사용함" : ""}</Badge> : s.createdBy === a.email && <Badge variant="primary">내가 만듦</Badge>}
                      </TableCell>
                      <TableCell className="tabular-nums">{day(s.createdAt)}</TableCell>
                      <TableCell className="py-1.5 text-right">
                        {s.kind === "passphrase" && <RemoveSlotButton id={s.id} last={passSlots <= 1} />}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </>
        )}
      </main>
    </>
  );
}
