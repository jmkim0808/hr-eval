"use client";

import { CircleAlert, CircleCheck, KeyRound, Lock, LockOpen, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input, Label } from "@/components/ui/input";
import { addSlotAction, lockAction, removeSlotAction, setupAction, unlockAction, type VaultFormState } from "./actions";

const MIN = 12;

function Status({ s }: { s: VaultFormState }) {
  if (!s.message) return null;
  return (
    <p role="status" data-testid="vault-status" className={`flex items-center gap-1.5 text-caption ${s.ok ? "text-success" : "text-danger"}`}>
      {s.ok ? <CircleCheck className="size-3.5" aria-hidden="true" /> : <CircleAlert className="size-3.5" aria-hidden="true" />}
      {s.message}
    </p>
  );
}

function Pass({ id, label, name = "passphrase", autoFocus }: { id: string; label: string; name?: string; autoFocus?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={name} type="password" autoComplete="new-password" minLength={MIN} required className="w-72" autoFocus={autoFocus} />
    </div>
  );
}

/** 처음 한 번 */
export function SetupForm() {
  const [s, action, pending] = useActionState(setupAction, {} as VaultFormState);
  const [ack, setAck] = useState(false);
  const router = useRouter();
  useEffect(() => {
    if (s.ok) router.refresh();
  }, [s, router]);
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <Pass id="v-pass" label={`비밀 문구 (${MIN}자 이상)`} autoFocus />
        <Pass id="v-confirm" name="confirm" label="한 번 더" />
      </div>
      <label className="flex items-center gap-2 text-body">
        <Checkbox checked={ack} onCheckedChange={(v) => setAck(!!v)} aria-label="복구 불가 안내 동의" />
        <input type="hidden" name="ack" value={ack ? "on" : ""} />
        비밀 문구를 잃어버리면 평가 내용을 아무도 복구할 수 없다는 것을 이해했습니다
      </label>
      <div>
        <Button type="submit" disabled={pending || !ack}>
          <KeyRound aria-hidden="true" />
          보안 열쇠 만들기
        </Button>
      </div>
      <Status s={s} />
    </form>
  );
}

export function UnlockForm() {
  const [s, action, pending] = useActionState(unlockAction, {} as VaultFormState);
  const router = useRouter();
  useEffect(() => {
    if (s.ok) router.refresh();
  }, [s, router]);
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="v-unlock">비밀 문구</Label>
          <Input id="v-unlock" name="passphrase" type="password" autoComplete="current-password" required className="w-72" autoFocus />
        </div>
        <Button type="submit" disabled={pending}>
          <LockOpen aria-hidden="true" />
          열기
        </Button>
      </div>
      <Status s={s} />
    </form>
  );
}

export function AddSlotForm() {
  const [s, action, pending] = useActionState(addSlotAction, {} as VaultFormState);
  return (
    <form action={action} key={s.ok ? s.at : "form"} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="v-label">누구의 열쇠인가요</Label>
          <Input id="v-label" name="label" required maxLength={40} className="w-44" placeholder="예: 홍길동 (예비)" />
        </div>
        <Pass id="v-new" label={`그 사람의 비밀 문구 (${MIN}자 이상)`} />
        <Pass id="v-new2" name="confirm" label="한 번 더" />
        <Button type="submit" variant="outline" disabled={pending}>
          <KeyRound aria-hidden="true" />
          열쇠 칸 추가
        </Button>
      </div>
      <Status s={s} />
    </form>
  );
}

export function LockButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await lockAction();
          router.refresh();
        })
      }
    >
      <Lock aria-hidden="true" />
      지금 잠그기
    </Button>
  );
}

export function RemoveSlotButton({ id, last }: { id: string; last: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="destructive"
        size="sm"
        disabled={last || pending}
        onClick={() =>
          start(async () => {
            const r = await removeSlotAction(id);
            setError(r.ok ? null : r.message);
            router.refresh();
          })
        }
      >
        <Trash2 aria-hidden="true" />
        지우기
      </Button>
      {(last || error) && <span className="text-label text-muted-foreground">{error ?? "마지막 열쇠 칸은 지울 수 없습니다"}</span>}
    </div>
  );
}
