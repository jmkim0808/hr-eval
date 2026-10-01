import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

// 작은 상태 표시. 아이콘 + 글자를 함께 쓴다.
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-label font-medium [&>svg]:pointer-events-none [&>svg]:size-3.5",
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
