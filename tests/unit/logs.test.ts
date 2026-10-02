import { describe, expect, it } from "vitest";
import { scrub } from "@/server/repo/logs";

describe("오류 기록에 개인정보를 남기지 않는다", () => {
  it("이메일·긴 숫자·따옴표 안 값을 지운다", () => {
    const m = scrub(`duplicate key value "kim@powernet.co.kr" for person 12345678 'secret'`);
    expect(m).not.toMatch(/kim@|12345678|secret/);
  });
});
