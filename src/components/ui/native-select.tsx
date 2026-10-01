import { ChevronDown } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

// shadcn native-select 방식: 브라우저 기본 선택칸 + 같은 모양
export function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <div className={cn("relative w-full min-w-36", className)} data-slot="native-select-wrapper">
      <select
        data-slot="native-select"
        className="h-9 w-full appearance-none rounded-md border border-input bg-card py-1 pr-9 pl-3 text-body shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25 aria-invalid:border-danger disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
        {...props}
      />
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
    </div>
  );
}
