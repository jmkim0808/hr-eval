import { Medal } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { BonusView } from "@/server/repo/bonus";

const pts = (n: number) => (n === 0 ? "0" : n.toFixed(2).replace(/\.?0+$/, ""));

/** 평가자 화면의 가점 표 (2026-10-15). 평가 점수와 따로, 최종점수에 더해진다 */
export function BonusBox({ bonus, final }: { bonus: BonusView | null; final?: boolean }) {
  return (
    <Card data-testid="reviewer-bonus">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Medal className="size-4" aria-hidden="true" />
          가점 {bonus ? <span className="tabular-nums">{pts(bonus.total)}점</span> : null}
        </CardTitle>
        <CardDescription>{final ? "확정된 가점" : "잠정치 · 인사담당자가 넣거나 고치면 바로 바뀝니다"} · 평가 점수와 별도로 최종점수에 더해집니다</CardDescription>
      </CardHeader>
      <CardContent>
        {!bonus ? (
          <p className="text-muted-foreground">아직 가점이 들어오지 않았습니다.</p>
        ) : bonus.items.length === 0 ? (
          <p className="text-muted-foreground">해당 항목이 없습니다 (0점).</p>
        ) : (
          <ul className="flex flex-wrap gap-x-5 gap-y-1">
            {bonus.items.map((i) => (
              <li key={i.label}>
                {i.label} <b className="tabular-nums">{pts(i.points)}</b>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
