"use client";

import { Undo2 } from "lucide-react";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { FieldError, Label, Textarea } from "@/components/ui/input";
import { rollbackStageAction } from "./actions";

/** 이전 단계로 되돌리기 (2026-10-15 피드백). 사유를 적어야 하고, 다른 관리자에게 알린다 */
export function RollbackButton({ from, version, fromLabel, toLabel }: { from: "first_review" | "second_review" | "final_review"; version: number; fromLabel: string; toLabel: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger className={buttonVariants({ variant: "ghost" })}>
        <Undo2 aria-hidden="true" />
        이전 단계로 되돌리기
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {fromLabel} 단계를 {toLabel} 단계로 되돌릴까요?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {toLabel} 단계가 다시 열려 그 단계 입력을 고칠 수 있습니다. 이미 넣은 점수·글은 그대로 남습니다. 다른 관리자에게 메일로 알리고 작업 기록에 남습니다. 직원·평가자에게 따로 메일은 가지 않습니다.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rollback-reason">되돌리는 사유</Label>
          <Textarea id="rollback-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className="min-h-20" placeholder="예: 개인작성 미제출자가 있는데 실수로 넘김" />
          <FieldError>{error}</FieldError>
        </div>
        <AlertDialogFooter>
          <AlertDialogClose className={buttonVariants({ variant: "outline" })}>취소</AlertDialogClose>
          <Button
            variant="destructive"
            disabled={pending || reason.trim().length < 2}
            onClick={() =>
              start(async () => {
                const r = await rollbackStageAction({ from, version, reason });
                if (!r.ok) return setError(r.message);
                setOpen(false);
                router.refresh();
              })
            }
          >
            되돌리기
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
