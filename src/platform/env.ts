// 환경 값 읽기. 값은 포털 관리자가 서버 환경변수로 넣는다 (ax-app.yaml의 env).
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
  /** 서버 기본 메일 설정 (전산이 넣은 환경 값). 없으면 null — 관리자 화면 설정만 쓴다 (2026-10-26) */
  get smtp(): { host: string; port: number; user: string; pass: string } | null {
    if (!process.env.SMTP_HOST) return null;
    return {
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? "465"),
      user: required("SMTP_USER"),
      pass: required("SMTP_PASS"),
    };
  },
  /** 포털 로그인 토큰 서명 확인용 (포털이 자동으로 넣어 줌) */
  get jwtSecret() {
    return required("JWT_SECRET_KEY");
  },
  get cronSecret() {
    return required("CRON_SECRET");
  },
};
