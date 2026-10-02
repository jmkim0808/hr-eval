import { describe, expect, it } from "vitest";
import { checkPeriods } from "@/domain/periods";

const ok = { selfStart: "2026-11-03", selfEnd: "2026-11-07", firstStart: "2026-11-10", firstEnd: "2026-11-17", secondStart: "2026-11-18", secondEnd: "2026-11-24", bonusCutoff: "2026-11-14" };

describe("기간 규칙 (PRD 03)", () => {
  it("올바른 순서면 오류 없음", () => expect(checkPeriods(ok)).toEqual({}));
  it("1차평가가 개인작성보다 앞서면 오류", () => expect(checkPeriods({ ...ok, firstStart: "2026-11-06" }).firstStart).toContain("개인작성 기간이 끝난 뒤"));
  it("2차평가가 1차와 겹치면 오류", () => expect(checkPeriods({ ...ok, secondStart: "2026-11-16" }).secondStart).toContain("1차평가 기간이 끝난 뒤"));
  it("끝이 시작보다 앞이면 오류", () => expect(checkPeriods({ ...ok, selfEnd: "2026-11-01" }).selfEnd).toBeDefined());
});
