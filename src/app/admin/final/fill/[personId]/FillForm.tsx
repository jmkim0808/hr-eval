"use client";

import { CircleAlert, Save, UserPen } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { FormType, Item } from "@/domain/forms";
import { ACHIEVEMENT, parseScore } from "@/domain/review";
import { cn } from "@/lib/utils";
import { fillBlankAction } from "../../actions";

type Cell = Record<string, { score: number; proxy: string | null }>;

export function FillForm({ personId, formType, items, first, second, open }: { personId: string; formType: FormType; items: Item[]; first: Cell; second: Cell; open: boolean }) {
  const router = useRouter();
  const [raw, setRaw] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const raters = formType === "member" ? (["first", "second"] as const) : (["first"] as const);
  const label = { first: formType === "member" ? "1차" : "임원", second: "2차" } as const;
  const rows = [...items.map((i) => ({ code: i.code, name: i.name })), { code: ACHIEVEMENT, name: "업적" }];
  const cells = { first, second };

  function save() {
    const out = { first: {} as Record<string, number>, second: {} as Record<string, number> };
    for (const [k, v] of Object.entries(raw)) {
      const [rater, code] = k.split(":") as ["first" | "second", string];
      const n = parseScore(v);
      if (n === "invalid") return setError("1~10 사이 숫자만 넣을 수 있습니다.");
      if (n) out[rater][code] = n;
    }
    start(async () => {
      const r = await fillBlankAction({ personId, ...out });
      if (!r.ok) return setError(r.message);
      setError(null);
      setRaw({});
      router.push("/admin/final");
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {!open && (
        <Alert variant="neutral">
          <CircleAlert aria-hidden="true" />
          <AlertDescription>최종평가 단계에서 확정 전까지만 대신 입력할 수 있습니다.</AlertDescription>
        </Alert>
      )}
      <Card className="gap-0 py-0">
        <div className={cn("grid items-center gap-3 border-b bg-muted px-5 py-2.5 text-label font-medium text-muted-foreground", raters.length === 2 ? "grid-cols-[1fr_12rem_12rem]" : "grid-cols-[1fr_12rem]")}>
          <span>항목</span>
          {raters.map((r) => (
            <span key={r}>{label[r]} 점수</span>
          ))}
        </div>
        {rows.map((row) => (
          <div key={row.code} className={cn("grid items-center gap-3 border-b px-5 py-2 last:border-b-0", raters.length === 2 ? "grid-cols-[1fr_12rem_12rem]" : "grid-cols-[1fr_12rem]")}>
            <span className="font-medium">{row.name}</span>
            {raters.map((r) => {
              const c = cells[r][row.code];
              if (c)
                return (
                  <span key={r} className="flex items-center gap-2" data-cell={`${r}:${row.code}`}>
                    <b className="tabular-nums">{c.score}</b>
                    {c.proxy && (
                      <span className="flex items-center gap-1 text-label text-info">
                        <UserPen className="size-3.5" aria-hidden="true" />
                        관리자 대신 입력 ({c.proxy})
                      </span>
                    )}
                  </span>
                );
              const k = `${r}:${row.code}`;
              return (
                <Input
                  key={r}
                  aria-label={`${row.name} ${label[r]} 점수 (빈칸)`}
                  inputMode="numeric"
                  maxLength={2}
                  disabled={!open}
                  value={raw[k] ?? ""}
                  onChange={(e) => setRaw((s) => ({ ...s, [k]: e.target.value }))}
                  className="h-8 w-20 border-warning text-center tabular-nums"
                  placeholder="빈칸"
                />
              );
            })}
          </div>
        ))}
      </Card>
      {error && (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {open && (
        <div className="flex justify-end">
          <Button size="lg" onClick={save} disabled={pending || Object.values(raw).every((v) => !v.trim())}>
            <Save aria-hidden="true" />
            대신 입력 저장
          </Button>
        </div>
      )}
    </div>
  );
}
