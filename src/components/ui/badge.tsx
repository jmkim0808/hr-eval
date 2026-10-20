import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

// 작은 상태 표시. 아이콘 + 글자를 함께 쓴다.
const badgeVariants = cva(
  "inline-flex w-fit max-w-full shrink-0 items-center gap-1 whitespace-normal sm:whitespace-nowrap rounded-full border px-2.5 py-0.5 text-label font-semibold [&>svg]:pointer-events-none [&>svg]:size-3.5",
  {
    variants: {
      variant: {
        secondary: "border-transparent bg-muted text-muted-foreground",
        outline: "border-border text-foreground",
        primary: "border-transparent bg-accent text-accent-foreground",
        success: "border-transparent bg-success-bg text-success",
        warning: "border-transparent bg-warning-bg text-warning",
        destructive: "border-transparent bg-danger-bg text-danger",
        info: "border-transparent bg-info-bg text-info",
        /** 2026-10-20: 역할 구분용 (팀장 = 청록, 임원 = 보라) */
        teal: "border-transparent bg-hl-teal-bg text-hl-teal",
        violet: "border-transparent bg-hl-violet-bg text-hl-violet",
        "grade-up": "border-grade-up-border bg-grade-up-bg text-grade-up",
        "grade-down": "border-grade-down-border bg-grade-down-bg text-grade-down",
        "grade-rule": "border-grade-rule-border bg-grade-rule-bg text-grade-rule",
      },
    },
    defaultVariants: { variant: "secondary" },
  },
);

export function Badge({ className, variant, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}
