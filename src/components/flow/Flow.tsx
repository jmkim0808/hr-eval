"use client";

import { Check, ChevronDown, ChevronUp, LayoutList, RectangleHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// 평가지·평가하기 공통 (2026-10-19 화면 개편): 토스형 "한 장씩" + 전체 흐름 레일 + "한눈에 보기"

export type FlowStep = { key: string; group: string; label: string; done: boolean; value?: string; error?: boolean };
export type FlowMode = "card" | "all";

const KEY = "hr-form-mode";

/** 보기 방식(한 장씩/한눈에) — 사람마다 브라우저에 기억한다. 저장소를 못 쓰면 한 장씩 */
export function useFlowMode(initial: FlowMode = "card"): [FlowMode, (m: FlowMode) => void] {
  const [mode, setMode] = useState<FlowMode>(initial);
  useEffect(() => {
    try {
      const v = localStorage.getItem(KEY);
      if (v === "card" || v === "all") setMode(v);
    } catch {}
  }, []);
  return [
    mode,
    (m) => {
      setMode(m);
      try {
        localStorage.setItem(KEY, m);
      } catch {}
    },
  ];
}

export function ModeSwitch({ mode, onChange }: { mode: FlowMode; onChange: (m: FlowMode) => void }) {
  const b = (m: FlowMode, label: string, Icon: typeof LayoutList) => (
    <button
      type="button"
      aria-pressed={mode === m}
      onClick={() => onChange(m)}
      className={cn("inline-flex items-center gap-1.5 rounded-[9px] px-3 py-1.5 text-caption font-semibold transition-colors", mode === m ? "bg-card text-foreground shadow-card" : "text-muted-foreground hover:text-foreground")}
    >
      <Icon className="size-4" aria-hidden="true" />
      {label}
    </button>
  );
  return (
    <div role="group" aria-label="보기 방식" className="inline-flex rounded-xl bg-muted p-[3px]" data-testid="mode-switch">
      {b("card", "한 장씩", RectangleHorizontal)}
      {b("all", "한눈에 보기", LayoutList)}
    </div>
  );
}

/** 왼쪽 전체 흐름: 채운 개수 고리 + 항목 목록(누르면 그 장으로). 좁은 화면에서는 접어 둔다 */
export function FlowRail({ steps, current, onPick, caption }: { steps: FlowStep[]; current: number | null; onPick: (i: number) => void; caption?: string }) {
  const [open, setOpen] = useState(false);
  const real = steps.filter((s) => s.key !== "_done");
  const n = real.filter((s) => s.done).length;
  const total = real.length;
  const r = 26;
  const c = 2 * Math.PI * r;
  let group = "";
  return (
    <aside aria-label="전체 흐름" className="flex flex-col rounded-2xl border border-border/70 bg-card p-4 shadow-card lg:sticky lg:top-20" data-testid="flow-rail">
      <div className="flex items-center gap-3.5 border-b border-border/70 pb-4">
        <svg width="60" height="60" viewBox="0 0 64 64" aria-hidden="true" className="shrink-0">
          <circle cx="32" cy="32" r={r} fill="none" className="stroke-muted" strokeWidth="7" />
          <circle cx="32" cy="32" r={r} fill="none" className="stroke-brand transition-[stroke-dasharray] duration-300" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${(c * n) / Math.max(1, total)} ${c}`} transform="rotate(-90 32 32)" />
        </svg>
        <div className="flex flex-col">
          <b className="text-section-title tabular-nums" data-testid="flow-count">
            {n} / {total}
          </b>
          <span className="text-caption text-muted-foreground">{n === total ? "모두 채웠습니다" : `${total - n}개 남음`}</span>
        </div>
        <button type="button" onClick={() => setOpen((o) => !o)} className="ml-auto inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-caption font-semibold lg:hidden" aria-expanded={open}>
          전체 항목 {open ? <ChevronUp className="size-4" aria-hidden="true" /> : <ChevronDown className="size-4" aria-hidden="true" />}
        </button>
      </div>
      {caption && <p className="pt-3 text-label font-semibold text-muted-foreground">{caption}</p>}
      <ol className={cn("mt-1 flex-col gap-0.5", open ? "flex" : "hidden lg:flex")}>
        {steps.map((s, i) => {
          const head = s.group !== group ? ((group = s.group), s.group) : null;
          return (
            <li key={s.key} className="flex flex-col">
              {head && <span className="px-2 pt-3 pb-1 text-label font-semibold text-muted-foreground">{head}</span>}
              <button
                type="button"
                aria-current={current === i ? "step" : undefined}
                onClick={() => {
                  onPick(i);
                  setOpen(false);
                }}
                className={cn(
                  "flex items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-left text-body transition-colors hover:bg-muted",
                  current === i && "bg-accent font-semibold text-accent-foreground hover:bg-accent",
                  s.error && "text-danger",
                )}
              >
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full border-[1.5px] text-[11px] font-bold tabular-nums",
                    s.done ? "border-brand bg-brand text-white" : s.error ? "border-danger text-danger" : "border-border bg-muted text-muted-foreground",
                  )}
                >
                  {s.done ? <Check className="size-3" aria-hidden="true" /> : i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate">{s.label}</span>
                {s.value && <span className={cn("text-caption tabular-nums", current === i ? "text-accent-foreground" : "text-muted-foreground")}>{s.value}</span>}
                <span className="sr-only">{s.done ? "(채움)" : "(비어 있음)"}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

/** 큰 점수 단추 1~10. selfMark = 본인평가 점수(주황 밑줄) */
export function ScaleButtons({ label, value, onPick, disabled, selfMark }: { label: string; value: number | undefined; onPick: (n: number) => void; disabled?: boolean; selfMark?: number }) {
  return (
    <div className="flex flex-col gap-2">
      <div role="group" aria-label={`${label} 점수`} className="grid grid-cols-5 gap-2 sm:grid-cols-10">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            disabled={disabled}
            aria-pressed={value !== undefined && Math.floor(value) === n}
            aria-label={`${n}점${selfMark === n ? " (본인평가)" : ""}`}
            onClick={() => onPick(n)}
            className={cn(
              "flex h-14 items-center justify-center rounded-[14px] border-[1.5px] border-border bg-card text-section-title font-bold tabular-nums transition-all hover:-translate-y-0.5 hover:border-brand disabled:pointer-events-none disabled:opacity-60",
              value !== undefined && Math.floor(value) === n && "border-foreground bg-foreground text-background hover:border-foreground",
              selfMark === n && "shadow-[inset_0_-4px_0_var(--color-hl-orange-text)]",
            )}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="flex justify-between text-label text-muted-foreground">
        <span>1 미흡</span>
        <span>5 보통</span>
        <span>10 탁월</span>
      </div>
    </div>
  );
}

/** 한 장 카드 아래 이전/다음 */
export function CardNav({ onPrev, onNext, prevDisabled, hint }: { onPrev: () => void; onNext: () => void; prevDisabled: boolean; hint?: React.ReactNode }) {
  return (
    <div className="mt-auto flex items-center justify-between gap-3 pt-8">
      <button type="button" onClick={onPrev} disabled={prevDisabled} className="rounded-xl border px-4 py-2.5 text-body font-semibold hover:bg-muted disabled:opacity-40">
        ← 이전
      </button>
      <span className="hidden text-caption text-muted-foreground sm:inline">{hint}</span>
      <button type="button" onClick={onNext} className="rounded-xl bg-primary px-5 py-2.5 text-body font-semibold text-primary-foreground hover:bg-primary-hover" data-testid="card-next">
        다음 →
      </button>
    </div>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded-md border border-b-2 bg-card px-1.5 py-px font-sans text-label text-text-secondary">{children}</kbd>;
}

/** 숫자키 1~9,0(=10)·Enter. 글 칸에서는 동작하지 않는다 */
export function useCardKeys(active: boolean, onDigit: ((n: number) => void) | null, onEnter: () => void) {
  useEffect(() => {
    if (!active) return;
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (/^(TEXTAREA|INPUT|SELECT)$/.test(t.tagName) || t.isContentEditable || e.metaKey || e.ctrlKey || e.altKey) return;
      if (onDigit && /^[0-9]$/.test(e.key)) {
        e.preventDefault();
        onDigit(e.key === "0" ? 10 : Number(e.key));
      } else if (e.key === "Enter" && t.tagName !== "BUTTON") {
        e.preventDefault();
        onEnter();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [active, onDigit, onEnter]);
}
