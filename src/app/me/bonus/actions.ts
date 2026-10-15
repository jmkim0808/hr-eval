"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, type Result } from "@/lib/result";
import { requireParticipant } from "@/server/authz/actor";
import { requestBonusFix } from "@/server/repo/bonus";

export async function requestBonusFixAction(message: unknown): Promise<Result> {
  const actor = await requireParticipant();
  const p = z.string().max(2000).safeParse(message);
  if (!p.success) return fail("invalid", "500자까지 쓸 수 있습니다.");
  const r = await requestBonusFix(actor, p.data);
  if (r.ok) revalidatePath("/me/bonus");
  return r;
}
