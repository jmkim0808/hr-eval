import { describe, expect, it } from "vitest";
import { maskEmail, signPortalToken, verifyPortalToken } from "@/server/auth/portal-token";

const S = "test-secret-key-for-portal-1234567890";
const now = Date.now();
const good = { sub: "E1001", name: "김대리", exp: Math.floor(now / 1000) + 3600 };

describe("포털 토큰 확인 (1차 인증)", () => {
  it("올바른 토큰은 통과, 사번을 돌려준다", () => {
    const r = verifyPortalToken(signPortalToken(good, S), S, now);
    expect(r).toMatchObject({ ok: true, claims: { sub: "E1001" } });
  });
  it("없음·서명 틀림·만료·비밀번호 변경 필요는 거절", () => {
    expect(verifyPortalToken(null, S).ok).toBe(false);
    expect(verifyPortalToken(signPortalToken(good, "other-secret"), S, now)).toEqual({ ok: false, reason: "invalid" });
    expect(verifyPortalToken(signPortalToken({ ...good, exp: Math.floor(now / 1000) - 120 }, S), S, now)).toEqual({ ok: false, reason: "expired" });
    expect(verifyPortalToken(signPortalToken({ ...good, must_change_password: true }, S), S, now)).toEqual({ ok: false, reason: "must_change_password" });
  });
  it("서명 없는 토큰(alg none)과 내용 바꿔치기는 거절", () => {
    const t = signPortalToken(good, S).split(".");
    const forged = Buffer.from(JSON.stringify({ ...good, sub: "ADMIN" })).toString("base64url");
    expect(verifyPortalToken(`${t[0]}.${forged}.${t[2]}`, S, now).ok).toBe(false);
    const none = `${Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url")}.${t[1]}.`;
    expect(verifyPortalToken(none, S, now).ok).toBe(false);
  });
  it("메일 주소 가리기", () => expect(maskEmail("kim@powernet.co.kr")).toBe("k***@powernet.co.kr"));
});
