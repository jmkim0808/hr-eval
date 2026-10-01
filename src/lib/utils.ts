import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// 우리 글자 크기 이름(text-body 등)을 색으로 오인해 지우지 않도록 알려 준다.
const twMerge = extendTailwindMerge({
  extend: { classGroups: { "font-size": [{ text: ["page-title", "section-title", "subsection-title", "body", "caption", "label"] }] } },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
