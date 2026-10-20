import { and, desc, eq } from "drizzle-orm";
import { FlaskConical, Mail } from "lucide-react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { isDemo } from "@/lib/demo";
import { getDb } from "@/server/db/client";
import { appUsers, cyclePeople, reviewCycles } from "@/server/db/schema";
import { sentInLogMode } from "@/server/mail/sender";
import { PickButton } from "./DevPicker";
import { PastYearButton } from "./PastYearButton";

export const dynamic = "force-dynamic";

const time = (ms: number) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", timeStyle: "medium" }).format(ms);

/** 시험 모드 전용 "가짜 포털": 사람 고르기 + 보낸 메일함. 운영(HR_DEMO 없음 또는 MAIL_MODE=smtp)에서는 404 */
export default async function DevPortalPage() {
  if (!isDemo()) notFound();
  const db = getDb();
  const users = await db.select().from(appUsers).where(eq(appUsers.active, true)).orderBy(appUsers.role, appUsers.name);
  const [cycle] = await db.select().from(reviewCycles).orderBy(desc(reviewCycles.year)).limit(1);
  const people = cycle
    ? await db.select().from(cyclePeople).where(and(eq(cyclePeople.cycleId, cycle.id))).orderBy(desc(cyclePeople.isExecutive), desc(cyclePeople.isTeamLeader), cyclePeople.department, cyclePeople.name)
    : [];
  const canLogin = !!cycle && cycle.status !== "setup";
  const hasPast = !!cycle && (await db.select({ id: reviewCycles.id }).from(reviewCycles).where(eq(reviewCycles.year, cycle.year - 1)).limit(1)).length > 0;
  const role = (p: typeof cyclePeople.$inferSelect) => (p.accessBlocked ? "접근 차단" : p.isExecutive ? "임원" : p.isTeamLeader ? "팀장" : p.isTarget ? "직원" : "평가 비대상");
  const mails = [...sentInLogMode].reverse().slice(0, 20);
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6">
      <PageHeader title="시험용 포털" description="사내 포털 대신 사람을 골라 들어갑니다 · 시험 모드에서만 보이는 화면입니다" />
      <Alert variant="info">
        <FlaskConical aria-hidden="true" />
        <AlertTitle>이렇게 시험합니다</AlertTitle>
        <AlertDescription>
          <p>① 사람을 고르면 2차 인증 화면으로 갑니다. 인증번호는 메일 대신 화면에 바로 보입니다.</p>
          <p>② 다른 사람으로 바꾸려면 이 화면(위쪽 노란 줄의 [사람 바꾸기])으로 돌아와 다시 고릅니다.</p>
          <p>③ 두 사람을 동시에 보려면 다른 브라우저(예: 엣지와 크롬)를 하나 더 씁니다.</p>
        </AlertDescription>
      </Alert>

      <Card className="pb-0">
        <CardHeader>
          <CardTitle>관리자 · 대표이사</CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>이름</TableHead>
              <TableHead>사번</TableHead>
              <TableHead>역할</TableHead>
              <TableHead className="text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.name}</TableCell>
                <TableCell className="tabular-nums">{u.employeeNo ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={u.role === "admin" ? "primary" : "info"}>{u.role === "admin" ? "관리자" : "대표이사"}</Badge>
                </TableCell>
                <TableCell className="py-1.5 text-right">{u.employeeNo && <PickButton employeeNo={u.employeeNo} name={u.name} />}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Card className="pb-0">
        <CardHeader>
          <CardTitle>
            {cycle ? `${cycle.year}년 평가 명단 ${people.length}명` : "평가 명단 없음"}
          </CardTitle>
          <CardDescription>
            {!cycle
              ? "관리자로 들어가 [평가 시작 설정]에서 시험용 명단 엑셀을 올려 주세요."
              : canLogin
                ? "직원·팀장·임원으로 들어가 볼 수 있습니다."
                : "안내 메일을 보내기 전(평가 시작 설정 단계)에는 직원이 들어올 수 없습니다 — 실제 운영과 같습니다."}
          </CardDescription>
        </CardHeader>
        {people.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>이름</TableHead>
                <TableHead>사번</TableHead>
                <TableHead>부서 · 직급</TableHead>
                <TableHead>역할</TableHead>
                <TableHead className="text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {people.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="tabular-nums">{p.employeeNo ?? "—"}</TableCell>
                  <TableCell>
                    {p.department || "—"} · {p.position}
                  </TableCell>
                  <TableCell>
                    <Badge variant={role(p) === "직원" ? "secondary" : role(p) === "평가 비대상" || role(p) === "접근 차단" ? "outline" : role(p) === "임원" ? "violet" : "teal"}>{role(p)}</Badge>
                  </TableCell>
                  <TableCell className="py-1.5 text-right">{p.employeeNo && <PickButton employeeNo={p.employeeNo} name={p.name} disabled={!canLogin} />}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>지난 평가 기록 시험용 데이터</CardTitle>
          <CardDescription>
            올해 명단을 그대로 써서 작년 정기평가(마감)를 가짜 점수·업적 글·평가의견·가점으로 만듭니다. 올해 안내 이메일을 보낸 뒤, 관리자로 보안 열쇠를 연 상태에서 누르세요.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PastYearButton disabled={!canLogin || hasPast} />
          {hasPast && <p className="mt-2 text-caption text-muted-foreground">작년 기록이 이미 있습니다.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="size-4" aria-hidden="true" />
            보낸 메일함 (최근 {mails.length}통)
          </CardTitle>
          <CardDescription>시험 모드에서는 메일을 실제로 보내지 않고 여기에만 남깁니다. 서버를 끄면 사라집니다.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {mails.length === 0 && <p className="text-caption text-muted-foreground">아직 보낸 메일이 없습니다.</p>}
          {mails.map((m, i) => (
            <details key={i} className="rounded-md border px-3 py-2">
              <summary className="cursor-pointer text-body">
                <span className="tabular-nums text-muted-foreground">{time(m.at)}</span> · {m.to} · <b>{m.subject}</b>
              </summary>
              <pre className="mt-2 whitespace-pre-wrap text-caption text-text-secondary">{m.text}</pre>
            </details>
          ))}
        </CardContent>
      </Card>
    </main>
  );
}
