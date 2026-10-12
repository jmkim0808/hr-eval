import type { Metadata } from "next";
import Link from "next/link";
import { isDemo } from "@/lib/demo";
import "./globals.css";

export const metadata: Metadata = {
  title: "파워넷 인사평가",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        {isDemo() && (
          <div className="flex items-center justify-center gap-3 bg-warning-bg px-4 py-1.5 text-caption text-warning" data-testid="demo-bar">
            <span>시험 모드 — 가짜 명단 · 메일은 보내지 않음 (실제 운영에는 이 줄이 없습니다)</span>
            <Link href="/dev" className="font-semibold underline underline-offset-2">
              사람 바꾸기 · 메일함
            </Link>
          </div>
        )}
        <div className="flex min-h-screen flex-col">{children}</div>
      </body>
    </html>
  );
}
