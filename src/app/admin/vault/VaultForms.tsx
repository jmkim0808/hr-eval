"use client";

import { CircleAlert, CircleCheck, KeyRound, Lock, LockOpen, Printer, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input, Label } from "@/components/ui/input";
import { addSlotAction, confirmRecoveryAction, createRecoveryAction, lockAction, removeSlotAction, setupAction, unlockAction, type VaultFormState } from "./actions";

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
          <Label htmlFor="v-unlock">비밀 문구 또는 복구 코드</Label>
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
      {(last || error) && <span className="text-label text-muted-foreground">{error ?? "마지막 비밀 문구 열쇠 칸은 지울 수 없습니다"}</span>}
    </div>
  );
}

/** 인쇄용 창: 코드와 사용법만 (메뉴·다른 화면 내용 없이) */
function printCode(code: string, by: string) {
  const w = window.open("", "_blank", "width=720,height=640");
  if (!w) return false;
  const when = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "long" }).format(new Date());
  const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  w.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>보안 열쇠 복구 코드</title>
<style>body{font-family:Pretendard,"Malgun Gothic",sans-serif;padding:40px;color:#111}h1{font-size:20px}code{display:block;font-size:26px;letter-spacing:2px;padding:18px;border:2px solid #111;border-radius:8px;margin:18px 0;text-align:center;font-family:Consolas,monospace}li{margin:6px 0;font-size:14px}.r{color:#b00;font-weight:700}</style></head><body>
<h1>㈜파워넷 인사평가 — 보안 열쇠 복구 코드</h1><p class="r">극비 · 봉투에 넣어 봉인한 뒤 금고에 보관</p><code>${esc(code)}</code>
<ul><li>만든 날: ${esc(when)} · 만든 사람: ${esc(by)}</li><li>쓰는 때: 비밀 문구를 잊었거나 담당자가 바뀌었을 때, 인사평가 [보안 열쇠] 화면의 입력 칸에 이 코드를 넣으면 열립니다.</li>
<li>한 번 쓰면 새 비밀 문구를 만들고, 복구 코드도 다시 만들어 이 종이를 바꿔 보관하세요.</li><li>새 복구 코드를 만들면 이 종이는 쓸 수 없게 됩니다 (파기).</li></ul></body></html>`);
  w.document.close();
  w.focus();
  w.print();
  return true;
}

/** 복구 코드 만들기 → 인쇄·옮겨 적기 → 다시 입력해 확인 (확인 전에는 평가를 시작할 수 없다) */
export function RecoveryCard({ ready, confirmedAt, usedAt, me }: { ready: boolean; confirmedAt: string | null; usedAt: string | null; me: string }) {
  const router = useRouter();
  const [code, setCode] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const day = (iso: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium" }).format(new Date(iso));

  const create = () =>
    start(async () => {
      const r = await createRecoveryAction();
      if (r.ok) {
        setCode(r.value.code);
        setTyped("");
        setMsg(null);
      } else setMsg({ ok: false, text: r.message });
    });

  if (code)
    return (
      <div className="flex flex-col gap-4" data-testid="recovery-new">
        <p className="text-body">아래 코드는 <b>지금 한 번만</b> 보입니다. 화면을 닫기 전에 인쇄하거나 그대로 옮겨 적으세요.</p>
        <code data-testid="recovery-code" className="w-fit rounded-xl border-2 border-foreground px-5 py-4 font-mono text-[22px] font-bold tracking-wider select-all sm:text-[26px]">
          {code}
        </code>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => printCode(code, me) || setMsg({ ok: false, text: "팝업이 막혀 인쇄 창을 열지 못했습니다. 옮겨 적어 주세요." })}>
            <Printer aria-hidden="true" />
            인쇄하기
          </Button>
        </div>
        <ol className="list-decimal pl-5 text-caption text-text-secondary">
          <li>인쇄(또는 옮겨 적기)한 종이를 봉투에 넣어 봉인하고 회사 금고에 보관합니다.</li>
          <li>제대로 적었는지 확인하려고, 종이를 보고 아래에 다시 넣어 주세요. 맞아야 저장됩니다.</li>
        </ol>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="recovery-confirm">종이에 적은 복구 코드</Label>
            <Input id="recovery-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" className="w-96 font-mono" placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX" />
          </div>
          <Button
            disabled={pending || !typed.trim()}
            data-testid="recovery-confirm-btn"
            onClick={() =>
              start(async () => {
                const r = await confirmRecoveryAction(typed);
                if (r.ok) {
                  setCode(null);
                  setMsg({ ok: true, text: "복구 코드를 확인했습니다. 이제 평가를 시작할 수 있습니다." });
                  router.refresh();
                } else setMsg({ ok: false, text: r.message });
              })
            }
          >
            <ShieldCheck aria-hidden="true" />
            확인
          </Button>
        </div>
        {msg && <Msg {...msg} />}
      </div>
    );

  return (
    <div className="flex flex-col gap-3" data-testid="recovery-status" data-ready={ready ? "yes" : "no"}>
      {ready ? (
        <p className="flex items-center gap-1.5 text-body text-success">
          <CircleCheck className="size-4" aria-hidden="true" />
          준비됨 · {confirmedAt && day(confirmedAt)} 확인 — 금고의 종이로 언제든 열 수 있습니다
        </p>
      ) : usedAt ? (
        <p className="flex items-center gap-1.5 text-body text-danger">
          <CircleAlert className="size-4" aria-hidden="true" />
          {day(usedAt)}에 복구 코드로 열었습니다. ① 아래 [열쇠 칸 추가]로 새 비밀 문구를 만들고 ② 잊은 열쇠 칸을 지운 뒤 ③ 복구 코드를 다시 만들어 종이를 바꿔 보관하세요.
        </p>
      ) : (
        <p className="flex items-center gap-1.5 text-body text-danger">
          <CircleAlert className="size-4" aria-hidden="true" />
          아직 없습니다. 만들고 확인하기 전에는 평가를 시작(안내 이메일 발송)할 수 없습니다.
        </p>
      )}
      <div>
        <Button variant={ready ? "outline" : "default"} disabled={pending} onClick={create} data-testid="recovery-create">
          {ready ? <RefreshCw aria-hidden="true" /> : <KeyRound aria-hidden="true" />}
          {ready ? "복구 코드 다시 만들기" : "복구 코드 만들기"}
        </Button>
        {ready && <span className="ml-3 text-caption text-muted-foreground">새로 만들어 확인하면 예전 종이는 쓸 수 없게 됩니다</span>}
      </div>
      {msg && <Msg {...msg} />}
    </div>
  );
}

function Msg({ ok, text }: { ok: boolean; text: string }) {
  return (
    <p role="status" data-testid="recovery-msg" className={`flex items-center gap-1.5 text-caption ${ok ? "text-success" : "text-danger"}`}>
      {ok ? <CircleCheck className="size-3.5" aria-hidden="true" /> : <CircleAlert className="size-3.5" aria-hidden="true" />}
      {text}
    </p>
  );
}
