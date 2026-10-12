import { afterEach, describe, expect, it } from "vitest";
import { close, dec, decNum, enc, encNum, newDataKey, openWith, unwrapKey, VaultLocked, wrapKey } from "@/server/crypto/vault";

afterEach(() => close());

describe("내용 암호화 (ADR-0021)", () => {
  it("잠겨 있으면 읽고 쓸 수 없다", () => {
    expect(() => enc("A")).toThrow(VaultLocked);
  });
  it("같은 값도 매번 다른 암호문, 되돌리면 원래 값", () => {
    openWith(newDataKey());
    const a = enc("신규 거래처 확보"), b = enc("신규 거래처 확보");
    expect(a).not.toBe(b);
    expect(a).not.toContain("거래처");
    expect(dec(a)).toBe("신규 거래처 확보");
    expect(decNum(encNum(87.25))).toBe(87.25);
    expect(enc("")).toBe("");
  });
  it("다른 열쇠로는 못 읽고, 암호문을 고치면 거절", () => {
    openWith(newDataKey());
    const c = enc("업적 글");
    openWith(newDataKey());
    expect(() => dec(c)).toThrow();
    expect(() => dec("평문")).toThrow();
  });
  it("관리자 비밀 문구로 잠근 열쇠: 맞는 문구만 연다", () => {
    const dek = newDataKey();
    const slot = wrapKey(dek, "파워넷-인사-2026-열쇠");
    expect(unwrapKey(slot, "파워넷-인사-2026-열쇠")!.equals(dek)).toBe(true);
    expect(unwrapKey(slot, "틀린 문구입니다 1234")).toBeNull();
  });
});
