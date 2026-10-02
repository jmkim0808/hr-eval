"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { TEXT_MAX } from "@/domain/forms";
import { fail } from "@/lib/result";
import { requireParticipant } from "@/server/authz/actor";
import { saveSelf, type SaveResult } from "@/server/repo/evaluations";

const input = z.object({
  personId: z.string().uuid(),
  version: z.number().int().min(0),
  draft: z.object({
    scores: z.record(z.string(), z.number().int().min(1).max(10)),
    achievement: z.string().max(TEXT_MAX),
    improvement: z.string().max(TEXT_MAX),
  }),
});

export async function saveSelfAction(raw: unknown): Promise<SaveResult> {
  const actor = await requireParticipant();
  const p = input.safeParse(raw);
  if (!p.success) return fail("invalid", `글은 ${TEXT_MAX.toLocaleString()}자까지 쓸 수 있습니다.`);
  return saveSelf(actor, p.data.personId, p.data.version, p.data.draft, false);
}

export async function submitSelfAction(raw: unknown): Promise<SaveResult> {
  const actor = await requireParticipant();
  const p = input.safeParse(raw);
  if (!p.success) return fail("invalid", `글은 ${TEXT_MAX.toLocaleString()}자까지 쓸 수 있습니다.`);
  const r = await saveSelf(actor, p.data.personId, p.data.version, p.data.draft, true);
  if (r.ok) revalidatePath("/me");
  return r;
}
