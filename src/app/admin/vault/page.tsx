import { ShieldCheck, ShieldAlert } from "lucide-react";
import { AdminNav } from "@/components/AdminNav";
import { PageHeader } from "@/components/PageHeader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireAdmin } from "@/server/authz/actor";
import { listSlots, vaultState } from "@/server/repo/vault";
import { AddSlotForm, LockButton, RemoveSlotButton, SetupForm, UnlockForm } from "./VaultForms";

export const dynamic = "force-dynamic";

const day = (d: Date) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium" }).format(d);

/** 보안 열쇠 (ADR-0021): 점수·글·등급을 암호화하는 열쇠. 서버가 다시 켜지면 관리자가 열어야 한다 */
export default async function VaultPage() {
  const a = await requireAdmin({ allowLocked: true });
  const state = await vaultState();
  const slots = state === "open" ? await listSlots(a) : [];
  return (
    <>
      <AdminNav current="/admin/vault" />
      <main className="flex flex-col gap-6 px-8 py-6">
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
                <AlertDescription>만든 뒤 바로 다른 관리자(또는 봉인 보관용 예비) 열쇠 칸을 하나 더 추가해 두세요.</AlertDescription>
              </Alert>
              <SetupForm />
            </CardContent>
          </Card>
        )}

        {state === "locked" && (
          <Card data-vault="locked">
            <CardHeader>
              <CardTitle>잠겨 있습니다</CardTitle>
              <CardDescription>서버가 다시 켜져 잠겼습니다. 열기 전까지 직원들은 평가 화면을 쓸 수 없습니다.</CardDescription>
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
                {slots.length < 2 && <CardDescription>하나뿐입니다. 비밀 문구를 잃어버리면 복구할 수 없으니 하나 더 추가해 두세요.</CardDescription>}
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
                        {s.label} {s.createdBy === a.email && <Badge variant="primary">내가 만듦</Badge>}
                      </TableCell>
                      <TableCell className="tabular-nums">{day(s.createdAt)}</TableCell>
                      <TableCell className="py-1.5 text-right">
                        <RemoveSlotButton id={s.id} last={slots.length <= 1} />
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
