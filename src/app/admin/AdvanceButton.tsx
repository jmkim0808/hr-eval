"use client";

import { ArrowRight, CircleAlert, Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { advanceStageAction } from "./actions";

type Props = { from: "self_review" | "first_review" | "second_review"; version: number; fromLabel: string; toLabel: string; pendingNames: string[] };

export function AdvanceButton({ from, version, fromLabel, toLabel, pendingNames }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-col items-end gap-2">
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger className={buttonVariants()}>
          다음 단계로 넘기기
          <ArrowRight aria-hidden="true" />
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {fromLabel} 단계를 끝내고 {toLabel} 단계로 넘길까요?
            </AlertDialogTitle>
            <AlertDialogDescription>넘기면 {fromLabel} 단계는 잠겨 더 이상 고칠 수 없습니다. 되돌릴 수 없습니다.</AlertDialogDescription>
          </AlertDialogHeader>
          {pendingNames.length > 0 ? (
            <Alert variant="warning">
              <Lock aria-hidden="true" />
              <AlertDescription>
                <p className="font-medium text-warning">미제출 {pendingNames.length}명은 빈칸인 채로 잠깁니다.</p>
                <p className="max-h-32 overflow-y-auto">{pendingNames.join(", ")}</p>
              </AlertDescription>
            </Alert>
          ) : (
            <p className="text-body text-success">미제출 0명 · 모두 제출했습니다.</p>
          )}
          <AlertDialogFooter>
            <AlertDialogClose className={buttonVariants({ variant: "outline" })}>취소</AlertDialogClose>
            <Button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await advanceStageAction({ from, version });
                  setOpen(false);
                  setError(r.ok ? null : r.message);
                  router.refresh();
                })
              }
            >
              넘기기
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {error && (
        <Alert variant="destructive" className="w-auto">
          <CircleAlert aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
