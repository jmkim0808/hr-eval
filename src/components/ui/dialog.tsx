"use client";

import { Dialog as Base } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

// shadcn dialog (Base UI). 닫기(✕)는 아이콘만 있는 버튼의 유일한 예외 — aria-label·title 필수
export const Dialog = Base.Root;
export const DialogTrigger = Base.Trigger;
export const DialogClose = Base.Close;

export function DialogContent({ className, children, ...props }: React.ComponentProps<typeof Base.Popup>) {
  return (
    <Base.Portal>
      <Base.Backdrop className="fixed inset-0 z-50 bg-foreground/30 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
      <Base.Popup
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-lg border bg-card p-6 shadow-lg transition-[scale,opacity] duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0",
          className,
        )}
        {...props}
      >
        {children}
        <Base.Close aria-label="닫기" title="닫기" className="absolute top-4 right-4 rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none">
          <X className="size-4" aria-hidden="true" />
        </Base.Close>
      </Base.Popup>
    </Base.Portal>
  );
}
export function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1.5 pr-6", className)} {...props} />;
}
export function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex justify-end gap-2", className)} {...props} />;
}
export function DialogTitle({ className, ...props }: React.ComponentProps<typeof Base.Title>) {
  return <Base.Title className={cn("text-section-title font-semibold", className)} {...props} />;
}
export function DialogDescription({ className, ...props }: React.ComponentProps<typeof Base.Description>) {
  return <Base.Description className={cn("text-body text-text-secondary", className)} {...props} />;
}
