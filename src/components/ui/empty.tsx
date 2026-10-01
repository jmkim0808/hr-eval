import * as React from "react";
import { cn } from "@/lib/utils";

// 비어 있을 때: 아이콘 + 제목 + 설명 + (있으면) 주 버튼 하나
export function Empty({ icon, title, children, action, className }: { icon: React.ReactNode; title: string; children?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center gap-3 px-6 py-12 text-center", className)}>
      <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-5">{icon}</div>
      <div className="space-y-1">
        <p className="text-subsection-title font-semibold">{title}</p>
        {children && <p className="text-caption text-muted-foreground">{children}</p>}
      </div>
      {action}
    </div>
  );
}
