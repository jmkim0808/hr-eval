import type { NextConfig } from "next";
import { BASE_PATH } from "./src/lib/base-path";

// 사내 앱 포털(윈도우 서버, Node 20)에 올린다 (ADR-0019). 포털 입구가 경로를 떼지 않고 넘기므로 모든 주소를 BASE_PATH 아래에 둔다.
const nextConfig: NextConfig = {
  output: "standalone",
  basePath: BASE_PATH,
  poweredByHeader: false,
  serverExternalPackages: ["nodemailer"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // 포털이 자기 화면 안에 띄울 수 있게 같은 주소(포털)에서만 허용
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
};

export default nextConfig;
