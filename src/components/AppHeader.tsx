import { Lock } from "lucide-react";
import { Icon } from "./Icon";

/** 모든 화면 맨 위: 머리줄 + 대외비 표시. 인증 전에는 열람자 없이 "대외비"만. */
export function AppHeader({ viewer }: { viewer?: string }) {
  return (
    <header className="app-header">
      <span className="app-header__title">㈜파워넷 · 인사평가</span>
      <span className="confidential">
        <Icon as={Lock} size={14} />
        {viewer ? `대외비 · 열람자 ${viewer}` : "대외비"}
      </span>
    </header>
  );
}
