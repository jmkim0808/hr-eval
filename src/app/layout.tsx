import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "파워넷 인사평가",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <div className="flex min-h-screen flex-col">{children}</div>
      </body>
    </html>
  );
}
