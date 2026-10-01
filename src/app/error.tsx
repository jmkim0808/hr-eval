"use client";

import { CircleX } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/** 예상 못 한 실패: 요청 번호만 보여 준다 (ADR-0013). */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12">
      <Alert variant="destructive">
        <CircleX aria-hidden="true" />
        <AlertTitle>문제가 생겼습니다</AlertTitle>
        <AlertDescription>
          <span>잠시 후 다시 시도해 주세요. 계속되면 관리자에게 요청 번호를 알려 주세요.</span>
          <span className="text-caption">요청 번호 {error.digest ?? "없음"}</span>
          <Button variant="outline" size="sm" onClick={reset}>
            다시 시도
          </Button>
        </AlertDescription>
      </Alert>
    </main>
  );
}
