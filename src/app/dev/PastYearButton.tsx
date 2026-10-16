"use client";

import { History } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { makePastYearAction } from "./actions";

export function PastYearButton({ disabled }: { disabled: boolean }) {
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col items-start gap-2">
      <Button variant="outline" disabled={disabled || pending} onClick={() => start(async () => setMsg(await makePastYearAction()))} data-testid="make-past-year">
        <History aria-hidden="true" />
        작년 평가 기록 만들기
      </Button>
      {msg && <p className={msg.ok ? "text-caption text-success" : "text-caption text-danger"}>{msg.message}</p>}
    </div>
  );
}
