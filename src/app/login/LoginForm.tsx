"use client";

import { CircleX, Clock, LogIn, Mail, ShieldCheck } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/input";
import { sendCodeAction, verifyCodeAction, type LoginState, type VerifyState } from "./actions";

const RESEND_SECONDS = 60;

export function LoginForm({ expired, initialEmail }: { expired: boolean; initialEmail: string }) {
  const [sendState, sendAction, sending] = useActionState(sendCodeAction, { step: "email", email: initialEmail } as LoginState);
  const [verifyState, verifyAction, verifying] = useActionState(verifyCodeAction, {} as VerifyState);
  const [now, setNow] = useState(() => Date.now());

  const step = sendState.step;
  const sentAt = sendState.sentAt ?? 0;
  const wait = Math.max(0, RESEND_SECONDS - Math.floor((now - sentAt) / 1000));
  useEffect(() => {
    if (step !== "code" || wait === 0) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [step, wait]);

  // 가장 최근에 일어난 일의 안내만 보인다 (다시 보내기 뒤에는 이전 오류를 지움).
  const error = step === "code" ? ((verifyState.at ?? 0) > sentAt ? verifyState.error : sendState.error) : sendState.error;

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <ShieldCheck className="size-5" aria-hidden="true" />
        </div>
        <CardTitle>이메일 인증</CardTitle>
        <CardDescription>회사 이메일로 받은 인증번호로 들어갑니다.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {expired && (
          <Alert variant="neutral">
            <Clock aria-hidden="true" />
            <AlertDescription>30분 동안 사용하지 않아 다시 인증이 필요합니다.</AlertDescription>
          </Alert>
        )}

        {step === "email" ? (
          <form action={sendAction} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">회사 이메일</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={sendState.email} aria-invalid={!!sendState.error || undefined} />
              <FieldError>
                {sendState.error && <CircleX className="size-3.5" aria-hidden="true" />}
                {sendState.error}
              </FieldError>
            </div>
            <Button className="w-full" disabled={sending}>
              <Mail aria-hidden="true" />
              {sending ? "보내는 중" : "인증번호 받기"}
            </Button>
          </form>
        ) : (
          <>
            <Alert variant="info">
              <Mail aria-hidden="true" />
              <AlertDescription>
                <span>{sendState.message ?? "인증번호를 보냈습니다. 메일함을 확인하세요."}</span>
                <span className="text-caption">{sendState.email}</span>
              </AlertDescription>
            </Alert>
            <form action={verifyAction} className="space-y-4">
              <input type="hidden" name="email" value={sendState.email} />
              <div className="space-y-1.5">
                <Label htmlFor="code">인증번호 6자리</Label>
                <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={7} required autoFocus className="text-center text-section-title tracking-[0.4em]" aria-invalid={!!error || undefined} />
                <FieldError>
                  {error && <CircleX className="size-3.5" aria-hidden="true" />}
                  {error}
                </FieldError>
              </div>
              <Button className="w-full" disabled={verifying}>
                <LogIn aria-hidden="true" />
                {verifying ? "확인 중" : "인증하기"}
              </Button>
            </form>
            <form action={sendAction} className="flex justify-center">
              <input type="hidden" name="email" value={sendState.email} />
              <input type="hidden" name="resend" value="1" />
              <Button variant="ghost" size="sm" disabled={wait > 0 || sending}>
                {wait > 0 ? `다시 보내기 (${wait}초 뒤)` : "다시 보내기"}
              </Button>
            </form>
          </>
        )}
      </CardContent>
    </Card>
  );
}
