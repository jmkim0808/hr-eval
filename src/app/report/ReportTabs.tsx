"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// 대표이사 화면 메뉴 (2026-10-26): 등급 결과 · 진행 현황
const TABS = [
  { href: "/report", label: "등급 결과" },
  { href: "/report/progress", label: "진행 현황" },
];

export function ReportTabs() {
  const path = usePathname();
  return (
    <nav aria-label="대표이사 메뉴" className="mx-auto flex w-full max-w-6xl gap-1 px-4 pt-4 sm:px-8">
      {TABS.map((t) => {
        const on = path === t.href || path.endsWith(t.href);
        return (
          <Link key={t.href} href={t.href} aria-current={on ? "page" : undefined} className={cn("rounded-full px-4 py-2 text-body font-semibold", on ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted")}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
