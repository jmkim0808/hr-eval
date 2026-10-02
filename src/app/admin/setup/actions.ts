"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { checkRoster, rawRowsSchema, type RosterCheck } from "@/domain/roster";
import { fail, ok, type Result } from "@/lib/result";
import { seoulYear } from "@/lib/time";
import { requireAdmin } from "@/server/authz/actor";
import { replaceRoster, updateReviewer } from "@/server/repo/roster";

export type RosterPreview = Pick<RosterCheck, "issues" | "counts">;

/** 미리보기: 브라우저가 읽은 줄을 서버가 같은 규칙으로 다시 검사 */
export async function previewRosterAction(rows: unknown): Promise<Result<RosterPreview>> {
  await requireAdmin();
  const parsed = rawRowsSchema.safeParse(rows);
  if (!parsed.success) return fail("invalid", "명단 형식이 템플릿과 다릅니다. 템플릿을 다시 내려받아 작성해 주세요.");
  const r = checkRoster(parsed.data, seoulYear());
  return ok({ issues: r.issues, counts: r.counts });
}

export async function applyRosterAction(rows: unknown): Promise<Result<RosterPreview>> {
  const actor = await requireAdmin();
  const parsed = rawRowsSchema.safeParse(rows);
  if (!parsed.success) return fail("invalid", "명단 형식이 템플릿과 다릅니다.");
  const year = seoulYear();
  const r = checkRoster(parsed.data, year);
  if (r.counts.needsCheck > 0) return fail("needs_check", `확인 필요 ${r.counts.needsCheck}명을 고쳐 다시 올려 주세요.`);
  const saved = await replaceRoster(actor, year, r.people);
  if (!saved.ok) return saved;
  revalidatePath("/admin/setup");
  revalidatePath("/admin");
  return ok({ issues: [], counts: r.counts });
}

const reviewerSchema = z.object({ personId: z.string().uuid(), slot: z.enum(["first", "second"]), reviewerId: z.string().uuid().nullable() });

export async function updateReviewerAction(input: unknown): Promise<Result> {
  const actor = await requireAdmin();
  const p = reviewerSchema.safeParse(input);
  if (!p.success) return fail("invalid", "잘못된 요청입니다.");
  const r = await updateReviewer(actor, p.data.personId, p.data.slot, p.data.reviewerId);
  if (r.ok) revalidatePath("/admin/setup");
  return r;
}
