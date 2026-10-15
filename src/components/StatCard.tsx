import * as React from "react";
import { cn } from "@/lib/utils";

/** 큰 숫자 카드 (2026-10-15 SaaS 스타일): 이름 · 큰 숫자 · 아래 한 줄(막대·설명·버튼) */
export function StatCard({ label, icon, value, foot, tone, className }: { label: string; icon?: React.ReactNode; value: React.ReactNode; foot?: React.ReactNode; tone?: "warning" | "danger"; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2 rounded-2xl border border-border/70 bg-card px-6 py-5 shadow-card", className)}>
      <span className="flex items-center gap-2 text-caption font-semibold text-muted-foreground [&_svg]:size-4">
        {icon}
        {label}
      </span>
      <span className={cn("text-[28px] leading-tight font-bold tracking-tight tabular-nums", tone === "warning" && "text-warning", tone === "danger" && "text-danger")}>{value}</span>
      {foot && <div className="text-caption text-muted-foreground">{foot}</div>}
    </div>
  );
}
