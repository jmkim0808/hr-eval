"use client";

import { Progress as Base } from "@base-ui/react/progress";
import * as React from "react";
import { cn } from "@/lib/utils";

export function Progress({ className, value, ...props }: React.ComponentProps<typeof Base.Root>) {
  return (
    <Base.Root value={value} className={cn("w-full", className)} {...props}>
      <Base.Track className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <Base.Indicator className="h-full bg-primary transition-[width] duration-500" />
      </Base.Track>
    </Base.Root>
  );
}
