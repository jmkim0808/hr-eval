import Link from "next/link";
import { Lock } from "lucide-react";
import { Logo } from "./AdminNav";
import { SessionGuard } from "./SessionGuard";

/**
 * 모든 화면 맨 위: 머리줄 + 대외비 표시. 인증 전에는 열람자 없이 "대외비"만.
 * 관리자 화면(왼쪽 세로 메뉴가 있을 때)은 넓은 화면에서 로고를 메뉴 쪽에 둔다(sidebar).
 */
export function AppHeader({ viewer, link, employeeNo, sidebar }: { viewer?: string; link?: { href: string; label: string }; employeeNo?: string | null; sidebar?: boolean }) {
  return (
    <header className="sticky top-0 z-20 border-b border-border/70 bg-card/85 backdrop-blur">
      {viewer && <SessionGuard employeeNo={employeeNo ?? null} />}
      <div className="flex h-16 items-center justify-between gap-4 px-6 lg:px-8">
        <div className={sidebar ? "flex items-center gap-2.5 lg:invisible" : "flex items-center gap-2.5"}>
          <Logo />
          <span className="text-subsection-title font-bold tracking-tight">파워넷 인사평가</span>
        </div>
        <div className="flex items-center gap-3">
          {link && (
            <Link href={link.href} className="rounded-full px-3 py-1.5 text-caption font-semibold text-primary hover:bg-accent">
              {link.label}
            </Link>
          )}
          <span className="inline-flex items-center gap-1.5 rounded-full bg-danger-bg px-3 py-1 text-label font-semibold text-confidential">
            <Lock className="size-3.5" aria-hidden="true" />
            {viewer ? `대외비 · 열람자 ${viewer}` : "대외비"}
          </span>
          {viewer && (
            <span className="flex size-8 items-center justify-center rounded-full bg-accent text-caption font-bold text-accent-foreground" aria-hidden="true">
              {viewer.slice(0, 1)}
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
