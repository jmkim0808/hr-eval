"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { isDemo } from "@/lib/demo";
import { env } from "@/platform/env";
import { signPortalToken } from "@/server/auth/portal-token";

/** 시험 모드 전용: 포털이 하는 일(로그인 토큰 발급)을 대신한다. 운영에서는 없는 주소처럼 보인다 */
export async function demoTokenAction(employeeNo: unknown, name: unknown): Promise<string> {
  if (!isDemo() || typeof employeeNo !== "string" || !/^[A-Za-z0-9-]{1,30}$/.test(employeeNo)) notFound();
  return signPortalToken({ sub: employeeNo, name: typeof name === "string" ? name.slice(0, 40) : "", exp: Math.floor(Date.now() / 1000) + 8 * 3600 }, env.jwtSecret);
}

/** 시험 모드 전용: 지난 평가 기록 시험용 작년 데이터 만들기 */
export async function makePastYearAction(): Promise<{ ok: boolean; message: string }> {
  if (!isDemo()) notFound();
  const { makeDemoPastYear } = await import("@/server/repo/demo-past");
  const r = await makeDemoPastYear();
  revalidatePath("/dev");
  return r.ok ? { ok: true, message: `${r.value.year}년 정기평가(마감) 기록을 ${r.value.people}명분 만들었습니다. 직원·팀장·임원으로 들어가 [지난 평가 기록]을 열어 보세요.` } : { ok: false, message: r.message };
}
