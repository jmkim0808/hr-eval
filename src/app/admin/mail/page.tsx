import { PageHeader } from "@/components/PageHeader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtWhen } from "@/lib/time";
import { requireAdmin } from "@/server/authz/actor";
import { mailFallback } from "@/server/mail/sender";
import { getMailSettingsView } from "@/server/repo/mail-settings";
import { ClearMailButton, MailForm } from "./MailForm";

/** 메일 발송 설정 (2026-10-26): 담당자가 바뀌어도 화면에서 보내는 계정을 바꾼다 */
export default async function MailSettingsPage() {
  const a = await requireAdmin();
  const v = await getMailSettingsView(a);
  const using = v.saved ? "admin" : v.serverDefault ? "server" : "none";
  const fellBack = mailFallback.at && Date.now() - mailFallback.at < 24 * 3600_000;
  return (
    <main className="flex flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8">
      <PageHeader title="메일 발송" description="인증번호·안내·독촉·결과 알림 메일을 보내는 계정 · 바꾸면 작업 기록에 남습니다" />
      {v.testMode && (
        <Alert variant="info">
          <AlertTitle>시험 모드</AlertTitle>
          <AlertDescription>메일을 실제로 보내지 않는 설정이라, 저장할 때 메일 서버 연결은 확인하지 않습니다.</AlertDescription>
        </Alert>
      )}
      {fellBack && (
        <Alert variant="destructive" data-testid="mail-fallback">
          <AlertTitle>화면 설정으로 보내지 못해 서버 기본 설정으로 보냈습니다</AlertTitle>
          <AlertDescription>최근 {fmtWhen(new Date(mailFallback.at!).toISOString())} · 비밀번호가 바뀌었는지 확인하고 아래에서 다시 저장해 주세요.</AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            지금 쓰는 설정
            <Badge variant={using === "none" ? "destructive" : "primary"} data-testid="mail-using">
              {using === "admin" ? "이 화면 설정" : using === "server" ? "서버 기본 설정" : "없음"}
            </Badge>
          </CardTitle>
          <CardDescription>
            {using === "admin" && v.saved && `${v.saved.fromName} <${v.saved.fromAddress}> · ${v.saved.host}:${v.saved.port} · ${fmtWhen(v.saved.updatedAt)} ${v.saved.updatedBy} 저장`}
            {using === "server" && v.serverDefault && `전산 담당자가 서버에 넣은 값 (${v.serverDefault.host}:${v.serverDefault.port}). 아래에 저장하면 그 설정이 먼저 쓰입니다.`}
            {using === "none" && "메일 설정이 없습니다. 아래에 넣어 주세요 — 없으면 로그인 인증번호가 나가지 않습니다."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-caption text-muted-foreground">
          <p>화면 설정이 연결·로그인에서 실패하면 서버 기본 설정(있을 때)으로 한 번 더 보냅니다.</p>
          {v.saved && <ClearMailButton disabled={!v.serverDefault && !v.testMode} />}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{v.saved ? "설정 바꾸기" : "설정 넣기"}</CardTitle>
          <CardDescription>개인 메일보다 인사팀 공용·발송 전용 계정을 권합니다 (담당자가 바뀌어도 그대로)</CardDescription>
        </CardHeader>
        <CardContent>
          <MailForm saved={v.saved} />
        </CardContent>
      </Card>
    </main>
  );
}
