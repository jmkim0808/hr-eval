"use client";

import { CircleAlert, CircleCheck, UserMinus, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { addAdminAction, removeAdminAction, type AddState } from "./actions";

export function AddAdminForm() {
  const [state, action, pending] = useActionState(addAdminAction, {} as AddState);
  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="admin-email">이메일</Label>
          <Input id="admin-email" name="email" type="email" autoComplete="off" className="w-72" required aria-invalid={!!state.message && !state.ok} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="admin-name">이름 (화면 표시용, 선택)</Label>
          <Input id="admin-name" name="name" className="w-44" />
        </div>
        <Button type="submit" disabled={pending}>
          <UserPlus aria-hidden="true" />
          관리자 추가
        </Button>
      </div>
      {state.message && (
        <p role="status" className={`flex items-center gap-1.5 text-caption ${state.ok ? "text-success" : "text-danger"}`}>
          {state.ok ? <CircleCheck className="size-3.5" aria-hidden="true" /> : <CircleAlert className="size-3.5" aria-hidden="true" />}
          {state.message}
        </p>
      )}
    </form>
  );
}

export function RemoveAdminButton({ email, last }: { email: string; last: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="destructive"
        size="sm"
        disabled={last || pending}
        onClick={() =>
          start(async () => {
            const r = await removeAdminAction(email);
            setError(r.ok ? null : r.message);
            router.refresh();
          })
        }
      >
        <UserMinus aria-hidden="true" />
        해제
      </Button>
      {(last || error) && <span className="text-label text-muted-foreground">{error ?? "마지막 관리자는 해제할 수 없습니다"}</span>}
    </div>
  );
}
