"use client";

import { MessageSquareWarning } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, Label, Textarea } from "@/components/ui/input";
import { requestBonusFixAction } from "./actions";

/** 가점 정정 요청: 틀린 항목과 근거를 적어 보내면 인사담당자에게 알림이 간다 */
export function FixRequest() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();
  const send = () =>
    start(async () => {
      setError(null);
      const r = await requestBonusFixAction(text);
      if (!r.ok) return setError(r.message);
      setText("");
      setSent(true);
      router.refresh();
    });
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="fix-message">정정 요청</Label>
      <Textarea
        id="fix-message"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setSent(false);
        }}
        maxLength={500}
        placeholder="예) 자격증 가점이 빠졌습니다. 2026년 6월 전기기사 취득 (자격증 사본은 인사팀에 메일로 보냄)"
        className="min-h-24"
      />
      <div className="flex items-center justify-between gap-3">
        <FieldError>{error}</FieldError>
        {sent && (
          <span className="text-label text-success" data-testid="fix-sent">
            요청을 보냈습니다. 인사담당자가 확인 후 고치면 이 화면에 바로 반영됩니다.
          </span>
        )}
        <Button onClick={send} disabled={pending || text.trim().length < 2} className="ml-auto">
          <MessageSquareWarning aria-hidden="true" />
          정정 요청 보내기
        </Button>
      </div>
    </div>
  );
}
