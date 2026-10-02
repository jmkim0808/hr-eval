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
  /** 등급 결과(보기 전용): 대표이사. 관리자도 같은 화면을 확인할 수 있다 */
  viewReport: (a: Actor) => a.roles.ceo || a.roles.admin,
  /** 내 평가결과: 본인만, 결과 알림 발송 뒤 */
  viewOwnResult: (a: Actor, personId: string, status: string) => a.personId === personId && ["results_sent", "closed"].includes(status),
  /** 본인 평가지 작성: 평가지 주인만 (관리자도 남의 평가지를 대신 쓰지 않는다) */
  writeSelfForm: (a: Actor, personId: string) => a.personId === personId,
};

export function assert(allowed: boolean): asserts allowed {
  if (!allowed) throw new Forbidden();
}
