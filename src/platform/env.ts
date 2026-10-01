// 환경 값 읽기. Cloudflare(OpenNext)와 Node 모두 process.env로 들어온다.
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`환경 값 ${name}이(가) 없습니다.`);
  return v;
}

export const env = {
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  get authSecret() {
    const v = required("AUTH_SECRET");
    if (v.length < 32) throw new Error("AUTH_SECRET은 32자 이상이어야 합니다.");
    return v;
  },
  get appUrl() {
    return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  },
  get mailMode(): "log" | "smtp" {
    return process.env.MAIL_MODE === "smtp" ? "smtp" : "log";
  },
  get mailFrom() {
    return process.env.MAIL_FROM ?? "파워넷 인사평가 <hr-eval@example.com>";
  },
  get mailAllowlist(): string[] | null {
    const v = process.env.MAIL_ALLOWLIST;
    if (v === undefined) return null; // 실제용: 제한 없음
    return v.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  },
  get smtp() {
    return {
      host: required("SMTP_HOST"),
      port: Number(process.env.SMTP_PORT ?? "465"),
      user: required("SMTP_USER"),
      pass: required("SMTP_PASS"),
    };
  },
  get cronSecret() {
    return required("CRON_SECRET");
  },
};
