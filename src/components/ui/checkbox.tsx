"use client";

import { Checkbox as Base } from "@base-ui/react/checkbox";
import { Check, Minus } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

// shadcn checkbox (Base UI)
export function Checkbox({ className, ...props }: React.ComponentProps<typeof Base.Root>) {
  return (
    <Base.Root
      data-slot="checkbox"
      className={cn(
        "peer flex size-4 shrink-0 items-center justify-center rounded-sm border border-input bg-card text-primary-foreground shadow-xs outline-none transition-colors",
        "focus-visible:ring-[3px] focus-visible:ring-ring/40 data-checked:border-primary data-checked:bg-primary data-indeterminate:border-primary data-indeterminate:bg-primary data-disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <Base.Indicator className="flex data-unchecked:hidden">
        {props.indeterminate ? <Minus className="size-3" strokeWidth={3} aria-hidden="true" /> : <Check className="size-3" strokeWidth={3} aria-hidden="true" />}
      </Base.Indicator>
    </Base.Root>
  );
}
