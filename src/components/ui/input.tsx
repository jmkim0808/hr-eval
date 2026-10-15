import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      data-slot="input"
      className={cn(
        "h-10 w-full min-w-0 rounded-[10px] border border-input bg-card px-3 py-1 text-body outline-none hover:border-[var(--color-border-input-hover)] transition-[color,box-shadow] placeholder:text-muted-foreground",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25",
        "aria-invalid:border-danger aria-invalid:ring-[3px] aria-invalid:ring-danger/15",
        "disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "min-h-24 w-full rounded-xl border border-input bg-card px-3.5 py-2.5 text-body leading-relaxed outline-none hover:border-[var(--color-border-input-hover)] transition-[color,box-shadow] placeholder:text-muted-foreground",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25 aria-invalid:border-danger aria-invalid:ring-[3px] aria-invalid:ring-danger/15",
        "disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label data-slot="label" className={cn("flex items-center gap-2 text-caption font-medium text-text-secondary", className)} {...props} />;
}

export function FieldError({ className, children, ...props }: React.ComponentProps<"p">) {
  if (!children) return null;
  return (
    <p role="alert" className={cn("flex items-center gap-1 text-label text-danger", className)} {...props}>
      {children}
    </p>
  );
}
