import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import * as React from "react";

/** 화면 머리. back = 위쪽 "← 돌아가기" 링크 (2026-10-20: 하위 화면마다 뒤로 가는 길) */
export function PageHeader({ title, description, actions, back }: { title: string; description?: string; actions?: React.ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="flex flex-col gap-3">
      {back && (
        <Link href={back.href} className="inline-flex w-fit items-center gap-1.5 rounded-lg px-2 py-1 -ml-2 text-caption font-semibold text-muted-foreground hover:bg-muted hover:text-foreground" data-testid="back-link">
          <ArrowLeft className="size-4" aria-hidden="true" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1.5">
          <h1 className="text-page-title font-bold tracking-tight">{title}</h1>
          {description && <p className="text-body text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}
