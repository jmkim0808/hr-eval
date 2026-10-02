// 예약 실행 주소 (1분마다). Cloudflare에서는 hr-eval-mailer의 예약 실행이, 회사 서버에서는 cron이 부른다.
// 비밀값으로만 보호하는 예외 주소다 (docs/tech/03-규칙.md 7).
import { sql } from "drizzle-orm";
import { env } from "@/platform/env";
import { getDb } from "@/server/db/client";
import { drainOutbox } from "@/server/repo/outbox";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${env.cronSecret}`) return new Response("forbidden", { status: 403 });
  // DB 깨우기 (Supabase 무료 플랜 7일 멈춤 방지, ADR-0011)
  await getDb().execute(sql`select 1`);
  // 보낼 메일 목록 비우기 (한 번에 10통, ADR-0006)
  const sent = await drainOutbox();
  return Response.json({ ok: true, sent });
}
