import { getDb } from "@/server/db/client";
import { errorLogs } from "@/server/db/schema";

/** 예상 못 한 실패 기록. 개인정보·점수·업적 글을 넣지 않는다 (규칙 16). */
export async function logError(where: string, message: string, requestId: string) {
  await getDb().insert(errorLogs).values({ where: where.slice(0, 200), message: message.slice(0, 300), requestId: requestId.slice(0, 64) });
}
