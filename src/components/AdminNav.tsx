import Link from "next/link";

// 만들어진 화면만 메뉴에 둔다. 조각이 늘어날 때마다 여기에 더한다.
const items = [
  { href: "/admin", label: "진행 현황" },
  { href: "/admin/setup", label: "평가 시작 설정" },
] as const;

export function AdminNav({ current }: { current: string }) {
  return (
    <nav className="app-nav" aria-label="관리자 메뉴">
      {items.map((i) => (
        <Link key={i.href} href={i.href} className={`app-nav__item${current === i.href ? " is-current" : ""}`} aria-current={current === i.href ? "page" : undefined}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
