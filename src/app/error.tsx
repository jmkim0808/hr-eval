"use client";

import { CircleX } from "lucide-react";
import { Icon } from "@/components/Icon";

/** 예상 못 한 실패: 요청 번호만 보여 준다 (ADR-0013). */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="page page--form">
      <div className="banner banner--danger" role="alert">
        <Icon as={CircleX} size={20} />
        <span className="banner__title">문제가 생겼습니다</span>
        <span className="banner__text">잠시 후 다시 시도해 주세요. 계속되면 관리자에게 요청 번호를 알려 주세요. 요청 번호 {error.digest ?? "없음"}</span>
        <button className="btn btn--secondary btn--small banner__action" onClick={reset}>
          다시 시도
        </button>
      </div>
    </main>
  );
}
