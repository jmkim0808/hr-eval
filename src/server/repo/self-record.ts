// 관리자 본인 기록 표시 (2026-10-26): 인사평가 담당 관리자가 피평가자이기도 하다.
// 본인 기록(가점·대신 입력·등급 조정·평가자 지정 등)을 고치는 것은 허용하되, 작업 기록에 selfRecord로 따로 남겨
// 전체 백업 엑셀의 "관리자 본인 기록 수정" 시트에서 누구나 확인할 수 있게 한다.
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { cyclePeople } from "@/server/db/schema";
import type { Actor } from "@/server/authz/actor";

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

/** 고친 대상에 관리자 본인이 들어 있으면 { selfRecord: true } — 작업 기록 detail에 펼쳐 넣는다 */
export async function selfMark(db: Tx | ReturnType<typeof getDb>, actor: Actor, personIds: (string | null | undefined)[]): Promise<{ selfRecord?: true }> {
  const ids = [...new Set(personIds.filter((x): x is string => !!x))];
  if (!ids.length) return {};
  const [hit] = await db.select({ id: cyclePeople.id }).from(cyclePeople).where(and(inArray(cyclePeople.id, ids), eq(cyclePeople.email, actor.email))).limit(1);
  return hit ? { selfRecord: true } : {};
}
