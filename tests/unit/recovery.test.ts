// 보안 열쇠 복구 코드 (2026-10-26)
import { describe, expect, it } from "vitest";
import { newRecoveryCode, normalizeRecoveryCode } from "@/domain/recovery";
import { newDataKey, unwrapKey, wrapKey } from "@/server/crypto/vault";

describe("복구 코드", () => {
  it("5글자×6묶음, 헷갈리는 글자(I·L·O·U) 없음, 매번 다르다", () => {
    const a = newRecoveryCode();
    expect(a).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}(-[0-9A-HJKMNP-TV-Z]{5}){5}$/);
    expect(newRecoveryCode()).not.toBe(a);
  });
  it("소문자·띄어쓰기·줄표 없이 넣어도, O·I·L을 잘못 적어도 같은 코드로 읽는다", () => {
    expect(normalizeRecoveryCode("abc01 2defg-hjk1m nP0QR stvwx yz234")).toBe("ABC01-2DEFG-HJK1M-NP0QR-STVWX-YZ234");
    expect(normalizeRecoveryCode("ABCOI-2DEFG-HJKLM-NPOQR-STVWX-YZ234")).toBe("ABC01-2DEFG-HJK1M-NP0QR-STVWX-YZ234");
  });
  it("길이가 틀리거나 다른 글자가 있으면 복구 코드가 아니다", () => {
    expect(normalizeRecoveryCode("ABCDE-FGHJK")).toBeNull();
    expect(normalizeRecoveryCode("비밀문구-입니다-2026!-길게-길게-길게")).toBeNull();
  });
  it("복구 코드로 잠근 열쇠는 그 코드로만 풀린다", () => {
    const dek = newDataKey();
    const code = newRecoveryCode();
    const slot = wrapKey(dek, code);
    expect(unwrapKey(slot, code)?.equals(dek)).toBe(true);
    expect(unwrapKey(slot, newRecoveryCode())).toBeNull();
  });
});
