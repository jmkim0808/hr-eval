// 메일 발송 설정 (2026-10-26): 비밀번호 잠금·입력 검사·실패 이유. DB·메일 서버 없이 확인한다.
import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.AUTH_SECRET ??= "x".repeat(40);
});

describe("서버 비밀값 잠금 (메일 비밀번호)", () => {
  it("잠그면 원문이 보이지 않고, 풀면 그대로 돌아온다. 매번 다른 암호문", async () => {
    const { seal, unseal } = await import("@/server/crypto/server-secret");
    const a = seal("Secret-Pass-123");
    const b = seal("Secret-Pass-123");
    expect(a.startsWith("s1:")).toBe(true);
    expect(a).not.toContain("Secret");
    expect(a).not.toBe(b);
    expect(unseal(a)).toBe("Secret-Pass-123");
  });
  it("서버 비밀값이 다르면 풀 수 없다", async () => {
    const { seal, unseal } = await import("@/server/crypto/server-secret");
    const a = seal("pw");
    const old = process.env.AUTH_SECRET;
    process.env.AUTH_SECRET = "y".repeat(40);
    expect(() => unseal(a)).toThrow();
    process.env.AUTH_SECRET = old;
  });
});

describe("입력 검사", () => {
  const ok = { host: "smtp.powernet.co.kr", port: 465, username: "hr@powernet.co.kr", password: "pw", fromName: "파워넷 인사평가", fromAddress: "hr@powernet.co.kr" };
  it("맞는 값은 통과, 저장된 비밀번호가 있으면 비밀번호 칸을 비워도 된다", async () => {
    const { validateMailSettings } = await import("@/server/repo/mail-settings");
    expect(validateMailSettings(ok, false)).toBeNull();
    expect(validateMailSettings({ ...ok, password: "" }, true)).toBeNull();
    expect(validateMailSettings({ ...ok, password: "" }, false)).toContain("비밀번호");
  });
  it("포트·주소·이름 형식이 틀리면 이유를 알려 준다", async () => {
    const { validateMailSettings } = await import("@/server/repo/mail-settings");
    expect(validateMailSettings({ ...ok, port: 70000 }, false)).toContain("포트");
    expect(validateMailSettings({ ...ok, host: "smtp server" }, false)).toContain("서버 주소");
    expect(validateMailSettings({ ...ok, fromAddress: "hr" }, false)).toContain("메일 주소");
    expect(validateMailSettings({ ...ok, fromName: 'a"b' }, false)).toContain("이름");
  });
});

describe("실패 이유·다시 보내기 판단", () => {
  it("로그인 실패·연결 실패는 설정 문제로 보고 서버 기본 설정으로 다시 보낸다", async () => {
    const { isSetupError, smtpWhy } = await import("@/platform/node/mail-transport");
    expect(isSetupError({ code: "EAUTH" })).toBe(true);
    expect(isSetupError({ code: "ETIMEDOUT" })).toBe(true);
    expect(isSetupError({ code: "EENVELOPE" })).toBe(false);
    expect(smtpWhy({ code: "EAUTH" }, 465)).toContain("비밀번호");
    expect(smtpWhy({ code: "ECONNECTION", message: "connect ECONNREFUSED" }, 587)).toContain("587");
  });
});
