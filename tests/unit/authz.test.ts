// 권한 허용 표(docs/tech/02-데이터-구조.md 2-3)를 바꾸면 이 테스트도 바꾼다.
import { describe, expect, it } from "vitest";
import type { Actor } from "@/server/authz/actor";
import { can } from "@/server/authz/policy";

const admin: Actor = { email: "a@x", name: "관리자", roles: { admin: true, ceo: false }, personId: "p-admin" };
const ceo: Actor = { email: "c@x", name: "대표", roles: { admin: false, ceo: true }, personId: null };
const staff: Actor = { email: "s@x", name: "직원", roles: { admin: false, ceo: false }, personId: "p-staff" };

describe("관리자 화면", () => {
  it("관리자만 진행 현황·평가 시작 설정을 쓸 수 있다", () => {
    expect(can.manageCycle(admin)).toBe(true);
    expect(can.manageCycle(ceo)).toBe(false);
  });
});

describe("본인 평가지", () => {
  it("평가지 주인만 쓸 수 있고, 관리자도 남의 평가지는 쓸 수 없다", () => {
    expect(can.writeSelfForm(staff, "p-staff")).toBe(true);
    expect(can.writeSelfForm(staff, "p-admin")).toBe(false);
    expect(can.writeSelfForm(admin, "p-staff")).toBe(false);
    expect(can.writeSelfForm(ceo, "p-staff")).toBe(false);
  });
});

describe("등급 결과", () => {
  it("대표이사와 관리자만 본다", () => {
    expect(can.viewReport(ceo)).toBe(true);
    expect(can.viewReport(admin)).toBe(true);
    expect(can.viewReport(staff)).toBe(false);
  });
});
