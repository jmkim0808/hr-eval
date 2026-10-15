"use client";

import { CalendarDays, CircleAlert, CircleCheck, Mail, Save } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import type { Periods } from "@/domain/periods";
import { savePeriodsAction, sendPeriodChangeAction, type PeriodsState } from "./actions";

const RANGES = [
  { label: "개인작성 기간", start: "selfStart", end: "selfEnd" },
  { label: "1차평가 기간", start: "firstStart", end: "firstEnd" },
  { label: "2차평가 기간", start: "secondStart", end: "secondEnd" },
] as const;

export function PeriodsForm({ initial, locked, lockMessage, sent = false }: { initial: Partial<Periods>; locked: boolean; lockMessage?: string; sent?: boolean }) {
  const [state, action, pending] = useActionState(savePeriodsAction, { values: initial } as PeriodsState);
  const v = state.values ?? initial;
  const err = state.errors ?? {};

  return (
    // 저장 뒤 React가 칸을 비우므로, 보낸 값으로 다시 그린다 (잘못 넣은 경우에도 입력이 남는다)
    <form key={JSON.stringify(v)} action={action} className="flex flex-col gap-5">
      <div className="grid gap-4">
        {RANGES.map((r) => (
          <fieldset key={r.label} className="grid grid-cols-[8rem_1fr] items-start gap-3">
            <legend className="sr-only">{r.label}</legend>
            <span className="pt-2 text-body font-medium">{r.label}</span>
            <div className="flex flex-wrap items-start gap-2">
              <div className="flex flex-col gap-1">
                <Label htmlFor={r.start} className="sr-only">{`${r.label} 시작`}</Label>
                <Input id={r.start} name={r.start} type="date" defaultValue={v[r.start] ?? ""} disabled={locked} aria-invalid={!!err[r.start]} className="w-44" />
                <FieldError>{err[r.start]}</FieldError>
              </div>
              <span className="pt-2 text-muted-foreground">~</span>
              <div className="flex flex-col gap-1">
                <Label htmlFor={r.end} className="sr-only">{`${r.label} 끝`}</Label>
                <Input id={r.end} name={r.end} type="date" defaultValue={v[r.end] ?? ""} disabled={locked} aria-invalid={!!err[r.end]} className="w-44" />
                <FieldError>{err[r.end]}</FieldError>
              </div>
            </div>
          </fieldset>
        ))}
        <div className="grid grid-cols-[8rem_1fr] items-start gap-3">
          <Label htmlFor="bonusCutoff" className="pt-2 text-body font-medium text-foreground">
            가점 인정 기준일
          </Label>
          <div className="flex flex-col gap-1">
            <Input id="bonusCutoff" name="bonusCutoff" type="date" defaultValue={v.bonusCutoff ?? ""} disabled={locked} aria-invalid={!!err.bonusCutoff} className="w-44" />
            <FieldError>{err.bonusCutoff}</FieldError>
            <p className="text-caption text-muted-foreground">이 날까지 취득·수상한 것만 가점으로 인정한다고 안내 이메일에 적힙니다.</p>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="outline" disabled={pending || locked}>
          <Save aria-hidden="true" />
          기간 저장
        </Button>
        {state.message && (
          <span role="status" className={`flex items-center gap-1.5 text-caption ${state.ok ? "text-success" : "text-danger"}`}>
            {state.ok ? <CircleCheck className="size-3.5" aria-hidden="true" /> : <CircleAlert className="size-3.5" aria-hidden="true" />}
            {state.message}
          </span>
        )}
        {sent && !locked && <PeriodChangeNotice highlight={!!state.ok} />}
        {locked && (
          <span className="flex items-center gap-1.5 text-caption text-muted-foreground">
            <CalendarDays className="size-3.5" aria-hidden="true" />
            {lockMessage ?? "2차평가가 끝나 기간을 바꿀 수 없습니다."}
          </span>
        )}
      </div>
    </form>
  );
}

/** 안내 메일을 보낸 뒤 기간을 바꿨으면 바뀐 일정을 다시 알린다 (2026-10-15 피드백) */
function PeriodChangeNotice({ highlight }: { highlight: boolean }) {
  const [ask, setAsk] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  if (msg) return <span role="status" className={`text-caption ${msg.ok ? "text-success" : "text-danger"}`} data-testid="period-change-result">{msg.text}</span>;
  if (!ask)
    return (
      <Button type="button" variant={highlight ? "default" : "ghost"} size="sm" onClick={() => setAsk(true)}>
        <Mail aria-hidden="true" />
        변경 안내 메일 보내기
      </Button>
    );
  return (
    <span className="flex items-center gap-2 text-caption">
      대상자·평가자 모두에게 바뀐 일정을 보냅니다.
      <Button
        type="button"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await sendPeriodChangeAction();
            setMsg(r.ok ? { ok: true, text: `${r.value.count}명에게 변경 안내 메일을 보냈습니다.` } : { ok: false, text: r.message });
          })
        }
      >
        보내기
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setAsk(false)}>
        취소
      </Button>
    </span>
  );
}
