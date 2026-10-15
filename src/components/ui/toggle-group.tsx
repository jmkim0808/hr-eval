"use client";

import { Toggle as BaseToggle } from "@base-ui/react/toggle";
import { ToggleGroup as BaseGroup } from "@base-ui/react/toggle-group";
import * as React from "react";
import { cn } from "@/lib/utils";

// shadcn toggle-group (Base UI). 점수 고르기처럼 하나만 누르는 버튼 줄.
export function ToggleGroup({ className, ...props }: React.ComponentProps<typeof BaseGroup>) {
  return <BaseGroup data-slot="toggle-group" className={cn("inline-flex w-fit items-center rounded-[10px] border border-input bg-card", className)} {...props} />;
}

export function ToggleGroupItem({ className, ...props }: React.ComponentProps<typeof BaseToggle>) {
  return (
    <BaseToggle
      data-slot="toggle-group-item"
      className={cn(
        "inline-flex h-9 min-w-9 items-center justify-center border-r px-2 text-caption font-medium text-text-secondary tabular-nums outline-none transition-colors first:rounded-l-[9px] last:rounded-r-[9px] last:border-r-0",
        "hover:bg-muted hover:text-foreground focus-visible:relative focus-visible:z-10 focus-visible:ring-[3px] focus-visible:ring-ring/40",
        "data-pressed:bg-primary data-pressed:text-primary-foreground data-pressed:hover:bg-primary-hover",
        "data-disabled:pointer-events-none data-disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}
