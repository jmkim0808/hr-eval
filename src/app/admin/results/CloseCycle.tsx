"use client";

import { CircleAlert, FolderLock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { closeCycleAction } from "@/app/admin/export-actions";
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

export function CloseCycle({ version, failed }: { version: number; failed: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger className={buttonVariants({ variant: "outline", className: "w-fit" })}>
        <FolderLock aria-hidden="true" />
        평가 마감
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>연봉조정까지 끝났나요?</AlertDialogTitle>
          <AlertDialogDescription>마감하면 그해 평가는 보기 전용 기록이 됩니다. 마감 직후 전체 기록 백업을 내려받아 보관하세요. 보관 기한은 마감일로부터 3년입니다.</AlertDialogDescription>
        </AlertDialogHeader>
        {failed > 0 && (
          <Alert variant="warning">
            <CircleAlert aria-hidden="true" />
            <AlertDescription>결과 메일을 받지 못한 사람이 {failed}명 있습니다. 마감해도 실패 명단은 계속 볼 수 있으니 수기로 전달해 주세요.</AlertDescription>
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
                const r = await closeCycleAction(version);
                if (!r.ok) return setError(r.message);
                setOpen(false);
                router.refresh();
              })
            }
          >
            마감
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
