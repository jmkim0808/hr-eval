import { desc } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { reviewCycles } from "@/server/db/schema";
import type { Actor } from "@/server/authz/actor";
import { assert, can } from "@/server/authz/policy";

/** 가장 최근 정기평가 (없으면 null) */
export async function getCurrentCycle(actor: Actor) {
  assert(can.manageCycle(actor));
  const [c] = await getDb()
    .select({ id: reviewCycles.id, year: reviewCycles.year, status: reviewCycles.status })
    .from(reviewCycles)
    .orderBy(desc(reviewCycles.year))
    .limit(1);
  return c ?? null;
}
