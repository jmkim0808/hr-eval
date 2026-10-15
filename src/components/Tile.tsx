import * as React from "react";
import { cn } from "@/lib/utils";

/** 강조색 (2026-10-15): 무채색·검정·파랑 위에 아이콘 칸에만 조금씩 쓴다 */
export type Hue = "blue" | "violet" | "green" | "orange" | "pink" | "teal" | "gray";
export const HUE: Record<Hue, string> = {
  blue: "bg-hl-blue-bg text-hl-blue",
  violet: "bg-hl-violet-bg text-hl-violet",
  green: "bg-hl-green-bg text-hl-green",
  orange: "bg-hl-orange-bg text-hl-orange",
  pink: "bg-hl-pink-bg text-hl-pink",
  teal: "bg-hl-teal-bg text-hl-teal",
  gray: "bg-muted text-muted-foreground",
};

/** 둥근 아이콘 칸 */
export function Tile({ hue = "blue", size = "md", children, className }: { hue?: Hue; size?: "sm" | "md" | "lg"; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center",
        size === "sm" ? "size-8 rounded-[10px] [&_svg]:size-4" : size === "md" ? "size-10 rounded-xl [&_svg]:size-5" : "size-12 rounded-2xl [&_svg]:size-6",
        HUE[hue],
        className,
      )}
    >
      {children}
    </span>
  );
}
