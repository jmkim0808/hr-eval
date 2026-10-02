import Link from "next/link";
import { Lock } from "lucide-react";

/** 모든 화면 맨 위: 머리줄 + 대외비 표시. 인증 전에는 열람자 없이 "대외비"만. */
export function AppHeader({ viewer, link }: { viewer?: string; link?: { href: string; label: string } }) {
  return (
    <header className="border-b bg-card">
      <div className="flex h-14 items-center justify-between gap-4 px-8">
        <div className="flex items-center gap-2.5">
          <span className="flex size-7 items-center justify-center rounded-md bg-primary text-label font-bold text-primary-foreground">PN</span>
          <span className="font-semibold">파워넷 인사평가</span>
        </div>
        <div className="flex items-center gap-4">
          {link && (
            <Link href={link.href} className="text-caption font-medium text-primary underline-offset-4 hover:underline">
              {link.label}
            </Link>
          )}
        <span className="inline-flex items-center gap-1.5 rounded-md border border-confidential/30 px-2 py-0.5 text-label font-medium text-confidential">
          <Lock className="size-3.5" aria-hidden="true" />
          {viewer ? `대외비 · 열람자 ${viewer}` : "대외비"}
        </span>
        </div>
      </div>
    </header>
  );
}
