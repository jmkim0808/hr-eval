"use client";

import { CircleAlert, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { BatchProgress } from "@/components/BatchProgress";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import type { BatchProgress as P } from "@/server/repo/outbox";
import { sendInvitesAction } from "./actions";

type Props = {
  version: number;
  blockers: string[];
  targets: number;
  batch: { id: string; progress: P } | null;
};

export function InviteCard({ version, blockers, targets, batch }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  if (batch) return <BatchProgress batchId={batch.id} initial={batch.progress} />;

  const disabled = blockers.length > 0 || pending;
  return (
    <div className="flex flex-col gap-3">
      {blockers.length > 0 && (
        <ul className="flex flex-col gap-1">
          {blockers.map((b) => (
            <li key={b} className="flex items-center gap-1.5 text-caption text-warning">
              <CircleAlert className="size-3.5" aria-hidden="true" />
              {b}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger className={buttonVariants({ className: "w-fit" })} disabled={disabled}>
          <Send aria-hidden="true" />
          안내 이메일 발송
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>안내 이메일을 보낼까요?</AlertDialogTitle>
            <AlertDialogDescription>
              대상자 {targets}명에게 보내고 개인작성 기간이 열립니다. 보낸 뒤에는 직원 명단을 다시 올릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose className={buttonVariants({ variant: "outline" })}>취소</AlertDialogClose>
            <Button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await sendInvitesAction(version);
                  setOpen(false);
                  if (!r.ok) setError(r.message);
                  router.refresh();
                })
              }
            >
              <Send aria-hidden="true" />
              {targets}명에게 발송
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
