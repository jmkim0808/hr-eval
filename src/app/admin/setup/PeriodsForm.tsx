"use client";

import { CalendarDays, CircleAlert, CircleCheck, Save } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import type { Periods } from "@/domain/periods";
import { savePeriodsAction, type PeriodsState } from "./actions";

const RANGES = [
  { label: "개인작성 기간", start: "selfStart", end: "selfEnd" },
  { label: "1차평가 기간", start: "firstStart", end: "firstEnd" },
  { label: "2차평가 기간", start: "secondStart", end: "secondEnd" },
] as const;

export function PeriodsForm({ initial, locked }: { initial: Partial<Periods>; locked: boolean }) {
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
        {locked && (
          <span className="flex items-center gap-1.5 text-caption text-muted-foreground">
            <CalendarDays className="size-3.5" aria-hidden="true" />
            2차평가가 끝나 기간을 바꿀 수 없습니다.
          </span>
        )}
      </div>
    </form>
  );
}
