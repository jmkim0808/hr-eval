"use client";

import { CircleAlert, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { sendResultsAction } from "@/app/admin/export-actions";
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

export function SendResults({ enabled, version, count }: { enabled: boolean; version: number; count: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger className={buttonVariants({ className: "w-fit" })} disabled={!enabled}>
          <Send aria-hidden="true" />
          평가결과 이메일 발송
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>평가결과 알림을 보낼까요?</AlertDialogTitle>
            <AlertDialogDescription>
              대상자 {count}명에게 &quot;결과가 나왔습니다&quot;와 링크만 보냅니다. 점수는 메일에 담기지 않고, 이메일 인증 뒤 내 평가결과 화면에서 봅니다. 보낸 뒤에는 확정을 취소할 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
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
                  const r = await sendResultsAction(version);
                  if (!r.ok) return setError(r.message);
                  setOpen(false);
                  router.refresh();
                })
              }
            >
              {count}명에게 발송
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {!enabled && <p className="text-caption text-muted-foreground">평가등급을 확정하면 보낼 수 있습니다.</p>}
    </div>
  );
}
