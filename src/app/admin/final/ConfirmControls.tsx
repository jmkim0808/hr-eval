"use client";

import { BadgeCheck, CircleAlert, Lock, TriangleAlert, Undo2 } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/input";
import { cancelConfirmAction, confirmAction } from "./actions";

type Props = { status: string; version: number; blanks: number; noBonus: number; confirmed: { at: string; by: string } | null };

export function ConfirmControls({ status, version, blanks, noBonus, confirmed }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (status === "final_review")
    return (
      <div className="flex flex-col items-end gap-1.5">
        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogTrigger className={buttonVariants()} disabled={blanks > 0}>
            <BadgeCheck aria-hidden="true" />
            확정
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>평가등급을 확정할까요?</AlertDialogTitle>
              <AlertDialogDescription>확정하면 등급을 고칠 수 없고, 가점 입력이 닫힙니다. 확정을 취소해도 가점은 다시 열리지 않습니다.</AlertDialogDescription>
            </AlertDialogHeader>
            {noBonus > 0 && (
              <Alert variant="warning">
                <TriangleAlert aria-hidden="true" />
                <AlertDescription>가점 미반영 {noBonus}명 · 확정 뒤에는 가점을 넣을 수 없습니다.</AlertDescription>
              </Alert>
            )}
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
                    const r = await confirmAction({ version });
                    if (!r.ok) return setError(r.message);
                    setOpen(false);
                    router.refresh();
                  })
                }
              >
                확정
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {blanks > 0 && (
          <span className="flex items-center gap-1 text-caption text-warning">
            <Lock className="size-3.5" aria-hidden="true" />
            점수 빈칸 {blanks}명을 대신 입력해야 확정할 수 있습니다
          </span>
        )}
      </div>
    );

  if (!confirmed) return null;
  const day = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric" }).format(new Date(confirmed.at)).replace(/\.\s?/g, "/").replace(/\/$/, "");
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Badge variant="success" className="px-2.5 py-1 text-caption">
        <BadgeCheck aria-hidden="true" />
        확정됨 ({day}, 확정자 {confirmed.by})
      </Badge>
      {status === "confirmed" && (
        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogTrigger className={buttonVariants({ variant: "destructive" })}>
            <Undo2 aria-hidden="true" />
            확정 취소
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>확정을 취소할까요?</AlertDialogTitle>
              <AlertDialogDescription>결과 알림을 보내기 전까지만 취소할 수 있습니다. 다른 관리자에게 메일로 알립니다. 가점 입력은 다시 열리지 않습니다.</AlertDialogDescription>
            </AlertDialogHeader>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cancel-reason">취소 사유</Label>
              <Textarea id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className="min-h-24" placeholder="예: 대표이사 보고 뒤 등급조정 의견 반영" />
            </div>
            {error && (
              <Alert variant="destructive">
                <CircleAlert aria-hidden="true" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <AlertDialogFooter>
              <AlertDialogClose className={buttonVariants({ variant: "outline" })}>닫기</AlertDialogClose>
              <Button
                variant="destructive"
                disabled={pending || reason.trim().length < 2}
                onClick={() =>
                  start(async () => {
                    const r = await cancelConfirmAction({ version, reason });
                    if (!r.ok) return setError(r.message);
                    setOpen(false);
                    setReason("");
                    router.refresh();
                  })
                }
              >
                확정 취소
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
