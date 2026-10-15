"use server";

import { z } from "zod";
import { requireAdmin } from "@/server/authz/actor";
import { getDb } from "@/server/db/client";
import { auditLogs } from "@/server/db/schema";
import { getCurrentCycle } from "@/server/repo/cycles";

/** 전체 현황 엑셀을 내려받으면 작업 기록에 남긴다 (ADR-0008) */
export async function logOverviewExportAction(raw: unknown) {
  const actor = await requireAdmin();
  const p = z.object({ rows: z.number().int().min(0), view: z.enum(["group", "dept"]) }).safeParse(raw);
  if (!p.success) return;
  const c = await getCurrentCycle(actor);
  await getDb().insert(auditLogs).values({ actorEmail: actor.email, action: "export.overview", cycleId: c?.id ?? null, detail: { rows: p.data.rows, view: p.data.view } });
}
