// 이메일 인증번호 받기·확인, 세션 만들기. 화면과 무관한 규칙만 둔다.
import { getDb } from "@/server/db/client";
import { env } from "@/platform/env";
import { fail, ok, type Result } from "@/lib/result";
import { sendMail } from "@/server/mail/sender";
import { otpMail } from "@/server/mail/templates";
import * as repo from "@/server/repo/login";
import { hmac, randomCode, randomToken, safeEqual } from "./crypto";
import { AUTH } from "./policy";

export const normalizeEmail = (e: string) => e.trim().toLowerCase();
const codeHash = (email: string, code: string) => hmac(env.authSecret, `code:${email}:${code}`);
export const sessionHash = (token: string) => hmac(env.authSecret, `session:${token}`);

/**
 * 인증번호 요청. 명단에 없는 이메일에도 같은 답을 준다(누가 명단에 있는지 바깥에서 알 수 없게).
 */
export async function requestCode(rawEmail: string, ip: string | null): Promise<Result> {
  const db = getDb();
  const email = normalizeEmail(rawEmail);
  const now = Date.now();
  const hourAgo = new Date(now - 3_600_000);

  const last = await repo.latestCodeRequest(db, email);
  if (last && now - last.createdAt.getTime() < AUTH.resendAfterMs) {
    return fail("too_soon", "잠시 후 다시 보내 주세요. (1분 뒤부터 다시 보낼 수 있습니다)");
  }
  if ((await repo.countCodeRequestsSince(db, { email }, hourAgo)) >= AUTH.perEmailPerHour) {
    return fail("rate_limited", "요청이 너무 많습니다. 1시간 뒤에 다시 시도해 주세요.");
  }
  if (ip && (await repo.countCodeRequestsSince(db, { ip }, hourAgo)) >= AUTH.perIpPerHour) {
    return fail("rate_limited", "요청이 너무 많습니다. 1시간 뒤에 다시 시도해 주세요.");
  }

  const who = await repo.findLoginIdentity(db, email);
  const expiresAt = new Date(now + AUTH.codeTtlMs);
  if (!who) {
    await repo.insertCode(db, { email, codeHash: null, expiresAt, requestIp: ip });
    return ok();
  }
  const code = randomCode();
  await repo.insertCode(db, { email, codeHash: await codeHash(email, code), expiresAt, requestIp: ip });
  await sendMail(otpMail(email, code));
  return ok();
}

/** 인증번호 확인 → 세션 열쇠(원문)를 돌려준다. 원문은 쿠키에만 들어가고 DB에는 해시만. */
export async function verifyCode(rawEmail: string, rawCode: string): Promise<Result<{ token: string; expiresAt: Date }>> {
  const db = getDb();
  const email = normalizeEmail(rawEmail);
  const code = rawCode.replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return fail("bad_format", "인증번호 6자리를 입력해 주세요.");

  const row = await repo.latestSentCode(db, email);
  if (!row) return fail("mismatch", "번호가 맞지 않습니다. 다시 확인해 주세요.");
  if (row.expiresAt.getTime() < Date.now()) return fail("expired", "시간이 지났습니다. 인증번호를 다시 받아 주세요.");
  if (row.attempts >= AUTH.maxAttempts) return fail("locked", "5번 틀려서 이 번호는 쓸 수 없습니다. 인증번호를 다시 받아 주세요.");

  if (!row.codeHash || !safeEqual(row.codeHash, await codeHash(email, code))) {
    await repo.addAttempt(db, row.id);
    const left = AUTH.maxAttempts - row.attempts - 1;
    return fail("mismatch", left > 0 ? `번호가 맞지 않습니다. (${left}번 남음)` : "5번 틀려서 이 번호는 쓸 수 없습니다. 인증번호를 다시 받아 주세요.");
  }
  if (!(await repo.consumeCode(db, row.id))) return fail("expired", "시간이 지났습니다. 인증번호를 다시 받아 주세요.");
  if (!(await repo.findLoginIdentity(db, email))) return fail("mismatch", "번호가 맞지 않습니다. 다시 확인해 주세요.");

  const token = randomToken();
  const expiresAt = new Date(Date.now() + AUTH.absoluteMs);
  await repo.insertSession(db, { tokenHash: await sessionHash(token), email, expiresAt });
  return ok({ token, expiresAt });
}
