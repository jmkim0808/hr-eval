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
  return (
    <ol className="grid grid-cols-7 overflow-hidden rounded-lg border bg-card" aria-label="진행 단계">
      {STAGES.map((s, i) => {
        const done = i < cur && !(i === 3 && cur === 4);
        const now = i === cur;
        return (
          <li
            key={s}
            aria-current={now ? "step" : undefined}
            className={cn(
              "flex flex-col gap-0.5 border-r border-b-2 border-b-transparent px-3 py-2.5 last:border-r-0",
              now && "border-b-primary bg-accent",
            )}
          >
            <span className={cn("flex items-center gap-1 text-body", now ? "font-semibold text-accent-foreground" : done ? "text-foreground" : "text-muted-foreground")}>
              {done && <Check className="size-3.5 text-success" aria-hidden="true" />}
              {s}
              {now && <span className="sr-only">(지금 단계)</span>}
              {done && <span className="sr-only">(끝남)</span>}
            </span>
            <span className="text-label text-muted-foreground tabular-nums">{notes[i] ?? (now ? "지금 단계" : " ")}</span>
            {now && overdue && (
              <span className="mt-0.5 inline-flex w-fit items-center gap-1 rounded-md bg-warning-bg px-1.5 text-label font-medium text-warning">
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
