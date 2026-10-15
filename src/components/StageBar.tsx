import { Check, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

// 단계 줄 (docs/ux/02 A01): 끝난 단계 ✔, 지금 단계는 연한 인디고 바탕 + 아래 인디고 줄
export const STAGES = ["개인작성", "1차평가", "2차평가", "가점", "최종평가", "확정", "결과 발송"] as const;

type Status = "setup" | "self_review" | "first_review" | "second_review" | "final_review" | "confirmed" | "results_sent" | "closed";

/** 지금 단계 칸 번호 (-1 = 아직 시작 전, 7 = 모두 끝남). 가점은 확정 전까지 함께 열려 있어 최종평가와 같이 본다 */
export function stageIndex(status: Status): number {
  return { setup: -1, self_review: 0, first_review: 1, second_review: 2, final_review: 4, confirmed: 5, results_sent: 6, closed: 7 }[status];
}

export function StageBar({ status, notes = {}, overdue = false }: { status: Status; notes?: Partial<Record<number, string>>; overdue?: boolean }) {
  const cur = stageIndex(status);
  // 2026-10-15 SaaS 스타일: 동그라미 번호 + 이어진 선. 끝난 단계는 ✔ 동그라미, 지금 단계는 기준색 동그라미
  return (
    <ol className="grid grid-cols-7 rounded-2xl border border-border/70 bg-card px-4 py-5 shadow-card" aria-label="진행 단계">
      {STAGES.map((s, i) => {
        const done = i < cur && !(i === 3 && cur === 4);
        const now = i === cur;
        return (
          <li key={s} aria-current={now ? "step" : undefined} className="relative flex flex-col items-center gap-1.5 px-1 text-center">
            {i > 0 && <span aria-hidden="true" className={cn("absolute top-4 right-1/2 -z-0 h-0.5 w-full", i <= cur ? "bg-primary/60" : "bg-border")} />}
            <span
              className={cn(
                "relative z-10 flex size-8 items-center justify-center rounded-full text-caption font-bold tabular-nums ring-4 ring-card",
                done ? "bg-primary text-primary-foreground" : now ? "bg-primary text-primary-foreground shadow-[0_0_0_4px_var(--color-selected-background)]" : "bg-muted text-muted-foreground",
              )}
            >
              {done ? <Check className="size-4" aria-hidden="true" /> : i + 1}
            </span>
            <span className={cn("text-body", now ? "font-bold text-foreground" : done ? "font-medium text-foreground" : "text-muted-foreground")}>
              {s}
              {now && <span className="sr-only">(지금 단계)</span>}
              {done && <span className="sr-only">(끝남)</span>}
            </span>
            <span className="text-label text-muted-foreground tabular-nums">{notes[i] ?? (now ? "지금 단계" : " ")}</span>
            {now && overdue && (
              <span className="inline-flex w-fit items-center gap-1 rounded-full bg-warning-bg px-2 py-0.5 text-label font-semibold text-warning">
                <TriangleAlert className="size-3" aria-hidden="true" />
                기한 지남
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
