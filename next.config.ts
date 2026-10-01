import type { NextConfig } from "next";

// 같은 코드를 Cloudflare Workers와 Node.js(회사 서버) 두 곳에서 빌드한다 (ADR-0002).
// 실행 환경에 따라 달라지는 것은 src/platform/ 아래 파일 하나로만 갈아 끼운다.
const target = process.env.BUILD_TARGET === "cloudflare" ? "cloudflare" : "node";
const mailTransport =
  target === "cloudflare" ? "./src/platform/cloudflare/mail-transport.ts" : "./src/platform/node/mail-transport.ts";

const nextConfig: NextConfig = {
  output: target === "node" ? "standalone" : undefined,
  poweredByHeader: false,
  turbopack: { resolveAlias: { "@platform/mail-transport": mailTransport } },
  serverExternalPackages: target === "node" ? ["nodemailer"] : [],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
};

export default nextConfig;
