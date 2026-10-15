import * as React from "react";
import { cn } from "@/lib/utils";
import { Tile, type Hue } from "./Tile";

/** 큰 숫자 카드 (2026-10-15 SaaS 스타일): 색 아이콘 칸 · 이름 · 큰 숫자 · 아래 한 줄(막대·설명·버튼) */
export function StatCard({ label, icon, hue = "blue", value, foot, tone, className }: { label: string; icon?: React.ReactNode; hue?: Hue; value: React.ReactNode; foot?: React.ReactNode; tone?: "warning" | "danger"; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3 rounded-2xl border border-border/70 bg-card px-6 py-5 shadow-card", className)}>
      <span className="flex items-center gap-2.5 text-caption font-semibold text-text-secondary">
        {icon && (
          <Tile hue={hue} size="sm">
            {icon}
          </Tile>
        )}
        {label}
      </span>
      <span className={cn("text-[30px] leading-tight font-bold tracking-tight tabular-nums", tone === "warning" && "text-warning", tone === "danger" && "text-danger")}>{value}</span>
      {foot && <div className="text-caption text-muted-foreground">{foot}</div>}
    </div>
  );
}
