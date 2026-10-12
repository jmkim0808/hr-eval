"use client";

import { CircleX, Clock, LogIn, Mail, ShieldCheck, UserX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/input";
import { portalToken } from "@/lib/portal";
import { portalCheckAction, portalSendCodeAction, portalVerifyAction, type PortalState } from "./actions";

const RESEND_SECONDS = 60;

// 1차: 포털 로그인(브라우저의 ax_access_token) → 2차: 회사 메일로 받은 인증번호 (ADR-0020)
export function LoginForm({ expired }: { expired: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<PortalState | null>(null);
  const [sentAt, setSentAt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [pending, start] = useTransition();

  useEffect(() => {
    start(async () => setState(await portalCheckAction(portalToken())));
  }, []);

  const wait = Math.max(0, RESEND_SECONDS - Math.floor((now - sentAt) / 1000));
  useEffect(() => {
    if (!sentAt || wait === 0) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [sentAt, wait]);

  function send() {
    start(async () => {
      const r = await portalSendCodeAction(portalToken());
      if (r.ok) {
        setSentAt(r.sentAt);
        setNow(Date.now());
        setError(null);
      } else setError(r.message);
    });
  }

  function verify(form: FormData) {
    start(async () => {
      const r = await portalVerifyAction(portalToken(), form.get("code"));
      if (r.ok) router.replace("/");
      else setError(r.message);
    });
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <ShieldCheck className="size-5" aria-hidden="true" />
        </div>
        <CardTitle>2차 인증</CardTitle>
        <CardDescription>포털 로그인에 더해, 회사 메일로 받은 인증번호를 한 번 더 확인합니다.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {expired && (
          <Alert variant="neutral">
            <Clock aria-hidden="true" />
            <AlertDescription>30분 동안 사용하지 않아 다시 인증이 필요합니다.</AlertDescription>
          </Alert>
        )}
        {!state && <p className="text-caption text-muted-foreground">포털 로그인을 확인하는 중…</p>}
        {state?.kind === "error" && (
          <Alert variant={state.code === "not_registered" ? "warning" : "destructive"} data-testid="portal-error">
            {state.code === "not_registered" ? <UserX aria-hidden="true" /> : <CircleX aria-hidden="true" />}
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        )}
        {state?.kind === "ready" && !sentAt && (
          <>
            <p className="text-body">
              <b>{state.name}</b> 님, 등록된 회사 메일 <b className="tabular-nums">{state.maskedEmail}</b>로 인증번호를 보냅니다.
            </p>
            <FieldError>
              {error && <CircleX className="size-3.5" aria-hidden="true" />}
              {error}
            </FieldError>
            <Button className="w-full" disabled={pending} onClick={send}>
              <Mail aria-hidden="true" />
              {pending ? "보내는 중" : "인증번호 받기"}
            </Button>
          </>
        )}
        {state?.kind === "ready" && sentAt > 0 && (
          <>
            <Alert variant="info">
              <Mail aria-hidden="true" />
              <AlertDescription>
                <span>인증번호를 보냈습니다. 메일함을 확인하세요.</span>
                <span className="text-caption">{state.maskedEmail}</span>
              </AlertDescription>
            </Alert>
            <form action={verify} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="code">인증번호 6자리</Label>
                <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={7} required autoFocus className="text-center text-section-title tracking-[0.4em]" aria-invalid={!!error || undefined} />
                <FieldError>
                  {error && <CircleX className="size-3.5" aria-hidden="true" />}
                  {error}
                </FieldError>
              </div>
              <Button className="w-full" disabled={pending}>
                <LogIn aria-hidden="true" />
                {pending ? "확인 중" : "인증하기"}
              </Button>
            </form>
            <div className="flex justify-center">
              <Button variant="ghost" size="sm" disabled={wait > 0 || pending} onClick={send}>
                {wait > 0 ? `다시 보내기 (${wait}초 뒤)` : "다시 보내기"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
