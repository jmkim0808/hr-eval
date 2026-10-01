// 아이콘은 Lucide만, 크기 14·16·20, 선 굵기 2, 글자 색을 따른다 (docs/ui/01-디자인-규칙.md 10).
import type { LucideIcon } from "lucide-react";

export function Icon({ as: C, size = 16 }: { as: LucideIcon; size?: 14 | 16 | 20 }) {
  return <C className="icon" size={size} strokeWidth={2} aria-hidden="true" focusable={false} />;
}
