"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail } from "@/lib/result";
import { requireParticipant } from "@/server/authz/actor";
import { cancelReview, saveReview, type ReviewSaveResult } from "@/server/repo/reviews";
import type { Result } from "@/lib/result";

const input = z.object({
  kind: z.enum(["first", "second", "leader"]),
  personId: z.string().uuid(),
  version: z.number().int().min(0),
  scores: z.record(z.string(), z.number()),
  comment: z.string().max(5000).optional(),
});

export async function saveReviewAction(raw: unknown, submit: boolean): Promise<ReviewSaveResult> {
  const actor = await requireParticipant();
  const p = input.safeParse(raw);
  if (!p.success) return fail("invalid", "잘못된 요청입니다.");
  const r = await saveReview(actor, p.data.kind, p.data.personId, p.data.version, p.data.scores, submit === true, p.data.comment);
  if (r.ok && submit) revalidatePath("/me", "layout");
  return r;
}

export async function cancelReviewAction(raw: unknown): Promise<Result<{ version: number }>> {
  const actor = await requireParticipant();
  const p = z.object({ kind: z.enum(["first", "second", "leader"]), personId: z.string().uuid() }).safeParse(raw);
  if (!p.success) return fail("invalid", "잘못된 요청입니다.");
  const r = await cancelReview(actor, p.data.kind, p.data.personId);
  if (r.ok) revalidatePath("/me", "layout");
  return r;
}
