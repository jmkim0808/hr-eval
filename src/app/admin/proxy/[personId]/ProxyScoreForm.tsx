"use client";

import { CircleAlert, CircleCheck, Save, Send, UserPen } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";

const COMMENT_MAX = 1000;
import type { Item } from "@/domain/forms";
import { ACHIEVEMENT, parseScore } from "@/domain/review";
import { proxyScoresAction } from "../actions";

type Cell = Record<string, { score: number; proxy: string | null }>;

/** 평가자 점수 대신 입력 (1차·2차 기간). 받은 점수를 그대로 옮긴다 — 평균 80점 규칙은 평가자 본인 입력에만 적용 */
export function ProxyScoreForm({ personId, rater, label, items, cells, submitted, comment: initialComment }: { personId: string; rater: "first" | "second"; label: string; items: Item[]; cells: Cell; submitted: boolean; comment: string }) {
  const router = useRouter();
  const rows = [...items.map((i) => ({ code: i.code, name: i.name })), { code: ACHIEVEMENT, name: "업적" }];
  const [raw, setRaw] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(cells).map(([k, v]) => [k, String(v.score)])));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [missing, setMissing] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const [comment, setComment] = useState(initialComment);

  function send(submit: boolean) {
    const scores: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw)) {
      const n = parseScore(v);
      if (n === "invalid") return setMsg({ ok: false, text: "1~10 사이, 소수 첫째 자리까지 넣을 수 있습니다." });
      if (n) scores[k] = n;
    }
    start(async () => {
      const r = await proxyScoresAction({ personId, rater, scores, submit, comment });
      if (r.ok) {
        setMissing(new Set());
        setMsg({ ok: true, text: submit ? `${label} 평가를 대신 입력하고 제출 처리했습니다.` : "저장했습니다." });
        router.refresh();
      } else {
        if (r.code === "incomplete" && "missing" in r) setMissing(new Set(r.missing));
        setMsg({ ok: false, text: r.message });
      }
    });
  }

  return (
    <Card className="gap-0 pb-0" data-proxy={rater}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <UserPen className="size-4" aria-hidden="true" />
          {label} 점수 대신 입력 {submitted && <span className="text-caption font-normal text-success">· 제출됨</span>}
        </CardTitle>
        <CardDescription>평가자에게 받은 점수를 그대로 옮겨 적습니다. 넣은 칸에는 관리자 이름이 남고 작업 기록에 남습니다. 평균 80점 규칙은 적용하지 않습니다.</CardDescription>
      </CardHeader>
      {rows.map((row) => {
        const c = cells[row.code];
        return (
          <div key={row.code} className="grid grid-cols-[1fr_6rem_12rem] items-center gap-3 border-t px-5 py-2">
            <span className="font-medium">{row.name}</span>
            <Input
              aria-label={`${row.name} ${label} 대신 입력`}
              aria-invalid={missing.has(row.code) || undefined}
              inputMode="decimal"
              maxLength={4}
              value={raw[row.code] ?? ""}
              onChange={(e) => setRaw((s) => ({ ...s, [row.code]: e.target.value }))}
              className="h-8 w-20 text-center tabular-nums"
            />
            <span className="text-label text-muted-foreground">{c ? (c.proxy ? `관리자 대신 입력 (${c.proxy})` : "평가자 입력") : "빈칸"}</span>
          </div>
        );
      })}
      <div className="flex flex-col gap-1.5 border-t px-5 py-3">
        <Label htmlFor={`proxy-comment-${rater}`}>{label} 평가의견 (선택)</Label>
        <p className="text-label text-muted-foreground">해당 의견란은 피평가자에게 표시됩니다.</p>
        <Textarea id={`proxy-comment-${rater}`} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={COMMENT_MAX} className="min-h-24 resize-y" />
        <span className="ml-auto text-label text-muted-foreground tabular-nums">
          {comment.length.toLocaleString()} / {COMMENT_MAX.toLocaleString()}자
        </span>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3 border-t px-5 py-3">
        {msg && (
          <span role="status" className={`flex items-center gap-1.5 text-caption ${msg.ok ? "text-success" : "text-danger"}`}>
            {msg.ok ? <CircleCheck className="size-3.5" aria-hidden="true" /> : <CircleAlert className="size-3.5" aria-hidden="true" />}
            {msg.text}
          </span>
        )}
        <Button variant="outline" onClick={() => send(false)} disabled={pending}>
          <Save aria-hidden="true" />
          저장
        </Button>
        <Button onClick={() => send(true)} disabled={pending}>
          <Send aria-hidden="true" />
          대신 제출
        </Button>
      </div>
    </Card>
  );
}

export function ClosedNote({ text }: { text: string }) {
  return (
    <Alert variant="neutral">
      <CircleAlert aria-hidden="true" />
      <AlertDescription>{text}</AlertDescription>
    </Alert>
  );
}
