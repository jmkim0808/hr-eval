// 예약 실행을 손으로 부르는 주소 (평소에는 앱 안 예약 실행이 1분마다 같은 일을 한다, ADR-0019).
// 비밀값으로만 보호하는 예외 주소다 (docs/tech/03-규칙.md 7).
import { sql } from "drizzle-orm";
import { env } from "@/platform/env";
import { getDb } from "@/server/db/client";
import { runErrorDigest } from "@/server/jobs/error-digest";
import { drainOutbox } from "@/server/repo/outbox";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${env.cronSecret}`) return new Response("forbidden", { status: 403 });
  // DB 깨우기 (Supabase 무료 플랜 7일 멈춤 방지, ADR-0011)
  await getDb().execute(sql`select 1`);
  // 아침 8시 이후 하루 한 번: 지난 24시간 오류 요약 (ADR-0013)
  const digest = await runErrorDigest();
  // 보낼 메일 목록 비우기 (한 번에 10통, ADR-0006)
  const sent = await drainOutbox();
  return Response.json({ ok: true, sent, digest });
}
