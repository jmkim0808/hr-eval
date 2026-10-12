"use server";

import { notFound } from "next/navigation";
import { isDemo } from "@/lib/demo";
import { env } from "@/platform/env";
import { signPortalToken } from "@/server/auth/portal-token";

/** 시험 모드 전용: 포털이 하는 일(로그인 토큰 발급)을 대신한다. 운영에서는 없는 주소처럼 보인다 */
export async function demoTokenAction(employeeNo: unknown, name: unknown): Promise<string> {
  if (!isDemo() || typeof employeeNo !== "string" || !/^[A-Za-z0-9-]{1,30}$/.test(employeeNo)) notFound();
  return signPortalToken({ sub: employeeNo, name: typeof name === "string" ? name.slice(0, 40) : "", exp: Math.floor(Date.now() / 1000) + 8 * 3600 }, env.jwtSecret);
}
