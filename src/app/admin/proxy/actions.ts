"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { TEXT_MAX } from "@/domain/forms";
import { fail, type Result } from "@/lib/result";
import { requireAdmin } from "@/server/authz/actor";
import { saveSelfByAdmin, type SaveResult } from "@/server/repo/evaluations";
import { proxyScores } from "@/server/repo/proxy";

// 관리자 대신 입력 (2026-10-15)
const selfInput = z.object({
  personId: z.string().uuid(),
  version: z.number().int().min(0),
  draft: z.object({ scores: z.record(z.string(), z.number().int().min(1).max(10)), achievement: z.string().max(TEXT_MAX), improvement: z.string().max(TEXT_MAX) }),
});

export async function proxySaveSelfAction(raw: unknown): Promise<SaveResult> {
  const actor = await requireAdmin();
  const p = selfInput.safeParse(raw);
  if (!p.success) return fail("invalid", `글은 ${TEXT_MAX.toLocaleString()}자까지 쓸 수 있습니다.`);
  return saveSelfByAdmin(actor, p.data.personId, p.data.version, p.data.draft, false);
}

export async function proxySubmitSelfAction(raw: unknown): Promise<SaveResult> {
  const actor = await requireAdmin();
  const p = selfInput.safeParse(raw);
  if (!p.success) return fail("invalid", `글은 ${TEXT_MAX.toLocaleString()}자까지 쓸 수 있습니다.`);
  const r = await saveSelfByAdmin(actor, p.data.personId, p.data.version, p.data.draft, true);
  if (r.ok) revalidatePath("/admin");
  return r;
}

const scoreInput = z.object({ personId: z.string().uuid(), rater: z.enum(["first", "second"]), scores: z.record(z.string(), z.number()), submit: z.boolean(), comment: z.string().max(5000).optional() });

export async function proxyScoresAction(raw: unknown): Promise<Result<{ count: number }> | { ok: false; code: "incomplete"; message: string; missing: string[] }> {
  const actor = await requireAdmin();
  const p = scoreInput.safeParse(raw);
  if (!p.success) return fail("invalid", "잘못된 요청입니다.");
  const r = await proxyScores(actor, p.data.personId, p.data.rater, p.data.scores, p.data.submit, p.data.comment);
  if (r.ok) revalidatePath("/admin");
  return r;
}
