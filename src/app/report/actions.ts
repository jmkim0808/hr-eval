"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, type Result } from "@/lib/result";
import { requireReportViewer } from "@/server/authz/actor";
import { setCeoGrade } from "@/server/repo/adjust";

const input = z.object({ personId: z.string().uuid(), to: z.enum(["S", "A", "B", "C", "D"]).nullable(), version: z.number().int().min(0) });

/** 대표이사 조정 (2026-10-15): 대표이사 화면과 관리자 최종평가 화면이 같이 쓴다 */
export async function setCeoGradeAction(raw: unknown): Promise<Result> {
  const actor = await requireReportViewer();
  const p = input.safeParse(raw);
  if (!p.success) return fail("invalid", "잘못된 요청입니다.");
  const r = await setCeoGrade(actor, p.data.personId, p.data.to, p.data.version);
  if (r.ok) {
    revalidatePath("/report");
    revalidatePath("/admin/final", "layout");
  }
  return r;
}
