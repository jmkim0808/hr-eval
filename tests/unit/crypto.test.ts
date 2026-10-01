import { describe, expect, it } from "vitest";
import { hmac, randomCode, randomToken, safeEqual } from "@/server/auth/crypto";

describe("인증 암호 도구", () => {
  it("인증번호는 항상 숫자 6자리", () => {
    for (let i = 0; i < 500; i++) expect(randomCode()).toMatch(/^\d{6}$/);
  });
  it("세션 열쇠는 매번 다르다", () => {
    expect(randomToken()).not.toBe(randomToken());
  });
  it("같은 비밀값·내용이면 같은 해시, 비밀값이 다르면 다른 해시", async () => {
    expect(await hmac("a".repeat(32), "x")).toBe(await hmac("a".repeat(32), "x"));
    expect(await hmac("a".repeat(32), "x")).not.toBe(await hmac("b".repeat(32), "x"));
  });
  it("safeEqual", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "ab")).toBe(false);
  });
});
