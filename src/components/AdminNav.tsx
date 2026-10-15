"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { Archive, ClipboardList, KeyRound, LayoutDashboard, Medal, Send, Settings2, Trophy, UserCog, Users } from "lucide-react";
import { cn } from "@/lib/utils";

// 관리자 메뉴 (2026-10-15 SaaS 스타일): 넓은 화면은 왼쪽 세로 메뉴, 좁은 화면은 위쪽 가로 메뉴. 지금 화면은 주소로 찾는다.
type Item = { href: string; label: string; icon: LucideIcon };
const groups: { label: string; items: Item[] }[] = [
  {
    label: "평가 운영",
    items: [
      { href: "/admin", label: "진행 현황", icon: LayoutDashboard },
      { href: "/admin/status", label: "전체 현황", icon: Users },
      { href: "/admin/bonus", label: "가점 입력", icon: Medal },
      { href: "/admin/final", label: "최종평가", icon: Trophy },
      { href: "/admin/results", label: "결과 발송", icon: Send },
    ],
  },
  {
    label: "설정",
    items: [
      { href: "/admin/setup", label: "평가 시작 설정", icon: Settings2 },
      { href: "/admin/cycles", label: "평가 관리", icon: Archive },
      { href: "/admin/settings", label: "관리자 설정", icon: UserCog },
      { href: "/admin/vault", label: "보안 열쇠", icon: KeyRound },
    ],
  },
];
const all = groups.flatMap((g) => g.items);

/** 주소에 가장 길게 맞는 메뉴 (대신 입력·평가지 보기 등 하위 화면은 진행 현황) */
function currentOf(path: string) {
  const hit = all.filter((i) => path === i.href || (i.href !== "/admin" && path.startsWith(`${i.href}/`))).sort((a, b) => b.href.length - a.href.length)[0];
  return hit?.href ?? (path.startsWith("/admin") ? "/admin" : "");
}

export function AdminSidebar({ meHref }: { meHref?: string }) {
  const cur = currentOf(usePathname());
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border/70 bg-card lg:flex">
      <div className="flex h-16 items-center gap-2.5 px-5">
        <Logo />
        <span className="text-subsection-title font-bold tracking-tight">파워넷 인사평가</span>
      </div>
      <nav aria-label="관리자 메뉴" className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-3">
        {groups.map((g) => (
          <div key={g.label} className="flex flex-col gap-0.5">
            <span className="px-3 pb-1.5 text-label font-semibold text-muted-foreground">{g.label}</span>
            {g.items.map((i) => {
              const on = cur === i.href;
              const Icon = i.icon;
              return (
                <Link
                  key={i.href}
                  href={i.href}
                  aria-current={on ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-[10px] px-3 py-2 text-body font-medium transition-colors",
                    on ? "bg-accent font-semibold text-accent-foreground" : "text-text-secondary hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className={cn("size-[18px]", on ? "text-accent-foreground" : "text-muted-foreground")} aria-hidden="true" />
                  {i.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      {meHref && (
        <div className="border-t border-border/70 p-3">
          <Link href={meHref} className="flex items-center gap-3 rounded-[10px] px-3 py-2 text-body font-medium text-text-secondary hover:bg-muted hover:text-foreground">
            <ClipboardList className="size-[18px] text-muted-foreground" aria-hidden="true" />내 할 일
          </Link>
        </div>
      )}
    </aside>
  );
}

/** 좁은 화면(휴대폰·작은 창)용 가로 메뉴 */
export function AdminTopNav() {
  const cur = currentOf(usePathname());
  return (
    <nav aria-label="관리자 메뉴" className="overflow-x-auto border-b border-border/70 bg-card px-4 lg:hidden">
      <div className="flex gap-1 py-2">
        {all.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            aria-current={cur === i.href ? "page" : undefined}
            className={cn("rounded-full px-3 py-1.5 text-caption whitespace-nowrap", cur === i.href ? "bg-accent font-semibold text-accent-foreground" : "text-muted-foreground hover:bg-muted")}
          >
            {i.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

export function Logo() {
  return <span className="flex size-8 items-center justify-center rounded-[10px] bg-primary text-label font-extrabold tracking-tight text-primary-foreground">PN</span>;
}
