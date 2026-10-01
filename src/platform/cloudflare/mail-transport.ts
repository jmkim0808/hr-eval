// Cloudflare Workers용 발송: 같은 계정의 작은 발송 전용 Worker(hr-eval-mailer)에 부탁한다.
// OpenNext 빌드가 cloudflare:sockets(SMTP용 TCP)를 묶지 못해 발송만 따로 뺐다 (ADR-0006 보완).
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { env } from "@/platform/env";
import type { MailTransport } from "@/server/mail/types";

type Bindings = { MAILER: { fetch: (req: Request) => Promise<Response> } };

export const smtpTransport: MailTransport = async (msg) => {
  const { env: cf } = getCloudflareContext() as unknown as { env: Bindings };
  const res = await cf.MAILER.fetch(
    new Request("https://mailer.internal/send", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env.cronSecret}` },
      body: JSON.stringify(msg),
    }),
  );
  if (!res.ok) throw new Error(`mailer ${res.status}`);
};
