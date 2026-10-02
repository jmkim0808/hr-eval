import { getDb } from "@/server/db/client";
import { errorLogs } from "@/server/db/schema";

/** 예상 못 한 실패 기록. 개인정보·점수·업적 글을 넣지 않는다 (규칙 16). */
export async function logError(where: string, message: string, requestId: string) {
  await getDb().insert(errorLogs).values({ where: where.slice(0, 200), message: scrub(message).slice(0, 300), requestId: requestId.slice(0, 64) });
}

/** 오류 글에 섞여 들어온 이메일·긴 숫자·따옴표 안 값(쿼리 인자 등)을 지운다 */
export const scrub = (m: string) =>
  m
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[이메일]")
    .replace(/\d{4,}/g, "[숫자]")
    .replace(/(["'])(?:(?!\1).){1,200}\1/g, "[값]");
