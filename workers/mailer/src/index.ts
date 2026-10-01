// hr-eval-mailer: 메일 발송 전용 작은 Worker (Cloudflare 배포에서만 사용).
// 1) 본 프로그램이 서비스 바인딩으로 POST /send → 다우오피스 SMTP로 발송
// 2) 1분마다 예약 실행 → 본 프로그램의 예약 실행 주소를 부른다 (보낼 메일 목록 비우기 등)
// 공개 주소는 끄고(workers_dev=false) 서비스 바인딩으로만 닿게 한다.
import { WorkerMailer } from "worker-mailer";

type Env = {
  SMTP_HOST: string;
  SMTP_PORT: string;
  SMTP_USER: string;
  SMTP_PASS: string;
  MAIL_FROM: string;
  CRON_SECRET: string;
  APP: { fetch: (req: Request) => Promise<Response> };
};

type Msg = { from: string; to: string; subject: string; text: string; html: string };

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method !== "POST" || url.pathname !== "/send") return new Response("not found", { status: 404 });
    if (req.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) return new Response("forbidden", { status: 403 });
    const msg = (await req.json()) as Msg;
    const port = Number(env.SMTP_PORT || "465");
    try {
      await WorkerMailer.send(
        { host: env.SMTP_HOST, port, secure: port === 465, startTls: port === 587, credentials: { username: env.SMTP_USER, password: env.SMTP_PASS }, authType: "plain" },
        { from: env.MAIL_FROM, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html },
      );
      return new Response("sent");
    } catch {
      // 받는 사람·내용은 기록하지 않는다
      return new Response("smtp failed", { status: 502 });
    }
  },

  async scheduled(_: unknown, env: Env): Promise<void> {
    await env.APP.fetch(new Request("https://app.internal/api/cron/tick", { method: "POST", headers: { authorization: `Bearer ${env.CRON_SECRET}` } }));
  },
};
