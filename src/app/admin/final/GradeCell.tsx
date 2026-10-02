"use client";

import { ArrowDown, ArrowRight, ArrowUp, CircleAlert, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { GRADES, type Grade } from "@/domain/grading";
import type { PreviewMove } from "@/server/repo/adjust";
import { applyAdjustAction, previewAdjustAction, revertAdjustAction } from "./actions";

const up = (from: Grade, to: Grade) => GRADES.indexOf(to) < GRADES.indexOf(from);

/** 등급 칸: 새 등급 고르기 → "이렇게 바뀝니다" → 적용 */
export function GradeCell({ personId, name, grade, version, editable }: { personId: string; name: string; grade: Grade; version: number; editable: boolean }) {
  const router = useRouter();
  const [plan, setPlan] = useState<PreviewMove[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!editable) return <span className="font-bold">{grade}</span>;
  return (
    <>
      <NativeSelect
        aria-label={`${name} 평가등급`}
        value={grade}
        className="w-20 min-w-20 font-bold"
        disabled={pending}
        onChange={(e) => {
          const to = e.target.value as Grade;
          start(async () => {
            const r = await previewAdjustAction({ personId, to });
            if (r.ok) {
              setError(null);
              setPlan(r.value);
            } else setError(r.message);
          });
        }}
      >
        {GRADES.map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
      </NativeSelect>
      {error && !plan && (
        <p role="alert" className="mt-1 max-w-48 text-label text-danger">
          {error}
        </p>
      )}
      <AlertDialog open={!!plan} onOpenChange={(o) => !o && (setPlan(null), router.refresh())}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>이렇게 바뀝니다</AlertDialogTitle>
            <AlertDialogDescription>등급별 인원을 지키려고 아래 사람이 함께 움직입니다. 최종점수는 바뀌지 않습니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="flex flex-col divide-y rounded-md border" aria-label="바뀌는 사람">
            {plan?.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="flex flex-col">
                  <span className="font-medium">{m.name}</span>
                  <span className="text-label text-muted-foreground tabular-nums">최종점수 {m.final.toFixed(2)}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="flex items-center gap-1 font-bold tabular-nums">
                    {m.from}
                    <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden="true" />
                    {m.to}
                  </span>
                  <ChangeBadge kind={m.kind === "manual" ? "adjusted" : "pushed"} up={up(m.from, m.to)} />
                </span>
              </li>
            ))}
          </ul>
          {error && (
            <Alert variant="destructive">
              <CircleAlert aria-hidden="true" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <AlertDialogFooter>
            <AlertDialogClose className={buttonVariants({ variant: "outline" })}>취소</AlertDialogClose>
            <Button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await applyAdjustAction({ personId, to: plan![0]!.to, version });
                  if (!r.ok) return setError(r.message);
                  setPlan(null);
                  setError(null);
                  router.refresh();
                })
              }
            >
              적용
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function ChangeBadge({ kind, up: isUp }: { kind: "adjusted" | "pushed"; up: boolean }) {
  const Icon = isUp ? ArrowUp : ArrowDown;
  const text = kind === "adjusted" ? `조정 · ${isUp ? "상향" : "하향"}` : isUp ? "올라감 · 상향" : "밀려남 · 하향";
  return (
    <Badge variant={isUp ? "grade-up" : "grade-down"}>
      <Icon aria-hidden="true" />
      {text}
    </Badge>
  );
}

export function RevertButton({ personId, version }: { personId: string; version: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await revertAdjustAction({ personId, version });
            setError(r.ok ? null : r.message);
            router.refresh();
          })
        }
      >
        <Undo2 aria-hidden="true" />
        되돌리기
      </Button>
      {error && (
        <span role="alert" className="text-label text-danger">
          {error}
        </span>
      )}
    </>
  );
}
