"use client";

import { CircleAlert, CircleCheck, Loader2, RotateCcw, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import type { MailSettingsView } from "@/server/repo/mail-settings";
import { clearMailSettingsAction, saveMailSettingsAction, type MailState } from "./actions";

export function MailForm({ saved }: { saved: MailSettingsView["saved"] }) {
  const [state, action, pending] = useActionState(saveMailSettingsAction, {} as MailState);
  const v = state.values ?? (saved ? { host: saved.host, port: String(saved.port), username: saved.username, fromName: saved.fromName, fromAddress: saved.fromAddress } : { host: "", port: "465", username: "", fromName: "파워넷 인사평가", fromAddress: "" });
  return (
    <form action={action} key={state.at ?? 0} className="flex flex-col gap-4" noValidate data-testid="mail-form">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="mail-from-name" name="fromName" label="보내는 사람 이름 (메일에 보이는 이름)" defaultValue={v.fromName} />
        <Field id="mail-from-address" name="fromAddress" label="보내는 메일 주소" type="email" defaultValue={v.fromAddress} hint="보통 아래 계정과 같은 주소" />
        <Field id="mail-host" name="host" label="메일 서버 주소 (SMTP)" defaultValue={v.host} hint="메일 관리자 화면·전산 담당자에게 확인" />
        <Field id="mail-port" name="port" label="포트" inputMode="numeric" defaultValue={v.port} hint="보통 465, 안 되면 587" />
        <Field id="mail-user" name="username" label="보내는 계정 (로그인 아이디)" defaultValue={v.username} />
        <Field id="mail-pass" name="password" label="비밀번호" type="password" autoComplete="new-password" defaultValue="" hint={saved ? "비워 두면 저장된 비밀번호를 그대로 씁니다" : "화면에 다시 보이지 않고 암호화해 저장합니다"} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending} data-testid="mail-save">
          {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Send aria-hidden="true" />}
          시험 메일 보내고 저장
        </Button>
        <span className="text-caption text-muted-foreground">내 메일로 시험 메일을 보내 보고, 성공해야 저장합니다 — 틀린 설정으로 로그인 인증번호가 막히지 않게</span>
      </div>
      {state.message && (
        <p role="status" data-testid="mail-status" className={`flex items-center gap-1.5 text-caption ${state.ok ? "text-success" : "text-danger"}`}>
          {state.ok ? <CircleCheck className="size-3.5" aria-hidden="true" /> : <CircleAlert className="size-3.5" aria-hidden="true" />}
          {state.message}
        </p>
      )}
    </form>
  );
}

function Field({ id, label, hint, ...rest }: { id: string; label: string; hint?: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} autoComplete="off" {...rest} />
      {hint && <span className="text-label text-muted-foreground">{hint}</span>}
    </div>
  );
}

export function ClearMailButton({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        variant="outline"
        size="sm"
        disabled={disabled || pending}
        data-testid="mail-clear"
        onClick={() =>
          start(async () => {
            const r = await clearMailSettingsAction();
            setMsg(r.ok ? null : r.message);
            router.refresh();
          })
        }
      >
        <RotateCcw aria-hidden="true" />
        화면 설정 지우고 서버 기본 설정 쓰기
      </Button>
      {msg && <span className="text-label text-danger">{msg}</span>}
    </div>
  );
}
