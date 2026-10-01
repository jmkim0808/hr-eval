// 누가 무엇을 볼 수 있는가 (docs/tech/02-데이터-구조.md 2-3). 이 표를 바꾸면 tests/authz 테스트도 바꾼다.
import type { Actor } from "./actor";

export class Forbidden extends Error {
  constructor() {
    super("forbidden");
  }
}

export const can = {
  /** 진행 현황·평가 시작 설정 등 관리자 화면 */
  manageCycle: (a: Actor) => a.roles.admin,
};

export function assert(allowed: boolean): asserts allowed {
  if (!allowed) throw new Forbidden();
}
