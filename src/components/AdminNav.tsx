import Link from "next/link";
import { cn } from "@/lib/utils";

// 만들어진 화면만 메뉴에 둔다. 조각이 늘어날 때마다 여기에 더한다.
const items = [
  { href: "/admin", label: "진행 현황" },
  { href: "/admin/bonus", label: "가점 입력" },
  { href: "/admin/final", label: "최종평가" },
  { href: "/admin/results", label: "결과 발송" },
  { href: "/admin/setup", label: "평가 시작 설정" },
] as const;

export function AdminNav({ current }: { current: string }) {
  return (
    <nav className="border-b bg-card px-8" aria-label="관리자 메뉴">
      <div className="flex gap-6">
        {items.map((i) => {
          const on = current === i.href;
          return (
            <Link
              key={i.href}
              href={i.href}
              aria-current={on ? "page" : undefined}
              className={cn("-mb-px border-b-2 py-3 text-body transition-colors", on ? "border-primary font-semibold text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}
            >
              {i.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
