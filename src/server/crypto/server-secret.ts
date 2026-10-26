// 서버 비밀값(AUTH_SECRET)으로 잠그는 작은 비밀 (메일 비밀번호 등). 보안 열쇠(평가 내용, vault.ts)와는 따로다:
// 서버가 다시 켜져 보안 열쇠가 잠겨 있어도 로그인 인증번호 메일은 나가야 하기 때문 (2026-10-26).
// DB만 새어 나가면 알아볼 수 없고, 서버 환경 값까지 있어야 풀린다.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "@/platform/env";

const PREFIX = "s1:";
const key = () => createHash("sha256").update(`hr-eval:server-secret:v1:${env.authSecret}`).digest();

export function seal(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return PREFIX + Buffer.concat([iv, body, c.getAuthTag()]).toString("base64url");
}

export function unseal(sealed: string): string {
  if (!sealed.startsWith(PREFIX)) throw new Error("알 수 없는 형식");
  const raw = Buffer.from(sealed.slice(PREFIX.length), "base64url");
  const d = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(raw.length - 16));
  return Buffer.concat([d.update(raw.subarray(12, raw.length - 16)), d.final()]).toString("utf8");
}
