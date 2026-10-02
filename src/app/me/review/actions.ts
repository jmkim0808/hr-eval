"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail } from "@/lib/result";
import { requireParticipant } from "@/server/authz/actor";
import { saveReview, type ReviewSaveResult } from "@/server/repo/reviews";

const input = z.object({
  kind: z.enum(["first", "second", "leader"]),
  personId: z.string().uuid(),
  version: z.number().int().min(0),
  scores: z.record(z.string(), z.number()),
});

export async function saveReviewAction(raw: unknown, submit: boolean): Promise<ReviewSaveResult> {
  const actor = await requireParticipant();
  const p = input.safeParse(raw);
  if (!p.success) return fail("invalid", "잘못된 요청입니다.");
  const r = await saveReview(actor, p.data.kind, p.data.personId, p.data.version, p.data.scores, submit === true);
  if (r.ok && submit) revalidatePath("/me", "layout");
  return r;
}
