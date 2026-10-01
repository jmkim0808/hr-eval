// 권한 허용 표(docs/tech/02-데이터-구조.md 2-3)를 바꾸면 이 테스트도 바꾼다.
import { describe, expect, it } from "vitest";
import type { Actor } from "@/server/authz/actor";
import { can } from "@/server/authz/policy";

const admin: Actor = { email: "a@x", name: "관리자", roles: { admin: true, ceo: false } };
const ceo: Actor = { email: "c@x", name: "대표", roles: { admin: false, ceo: true } };

describe("관리자 화면", () => {
  it("관리자만 진행 현황·평가 시작 설정을 쓸 수 있다", () => {
    expect(can.manageCycle(admin)).toBe(true);
    expect(can.manageCycle(ceo)).toBe(false);
  });
});
