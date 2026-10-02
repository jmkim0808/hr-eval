"use client";

import { AlertDialog as Base } from "@base-ui/react/alert-dialog";
import * as React from "react";
import { cn } from "@/lib/utils";

// 확인 창 (shadcn alert-dialog, Base UI). 주 버튼은 창 안에 하나만.
export const AlertDialog = Base.Root;
export const AlertDialogTrigger = Base.Trigger;
export const AlertDialogClose = Base.Close;

export function AlertDialogContent({ className, children, ...props }: React.ComponentProps<typeof Base.Popup>) {
  return (
    <Base.Portal>
      <Base.Backdrop className="fixed inset-0 z-50 bg-foreground/30 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
      <Base.Popup
        data-slot="alert-dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border bg-card p-6 shadow-lg transition-[scale,opacity] duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0",
          className,
        )}
        {...props}
      >
        {children}
      </Base.Popup>
    </Base.Portal>
  );
}
export function AlertDialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1.5", className)} {...props} />;
}
export function AlertDialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex justify-end gap-2", className)} {...props} />;
}
export function AlertDialogTitle({ className, ...props }: React.ComponentProps<typeof Base.Title>) {
  return <Base.Title className={cn("text-section-title font-semibold", className)} {...props} />;
}
export function AlertDialogDescription({ className, ...props }: React.ComponentProps<typeof Base.Description>) {
  return <Base.Description className={cn("text-body text-text-secondary", className)} {...props} />;
}
