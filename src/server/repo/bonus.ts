// 가점 (PRD 09). 관리자만, 평가등급 확정 전까지.
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { BONUS_ITEMS, bonusTotal, checkValues, type BonusCode, type BonusRow, type BonusValues } from "@/domain/bonus";
import { fail, ok, type Result } from "@/lib/result";
import { getDb } from "@/server/db/client";
import { recomputeFinal } from "@/server/repo/final";
import { appUsers, auditLogs, bonusHistory, bonusPoints, bonusRequests, cyclePeople, emailOutbox, reviewCycles } from "@/server/db/schema";
import type { Actor } from "@/server/authz/actor";
import { assert, can } from "@/server/authz/policy";
import { dec, decNum, enc, encNum } from "@/server/crypto/vault";

const LOCKED = ["confirmed", "results_sent", "closed"];
/** 확정 전까지. 한 번 확정했으면 확정을 취소해도 다시 열리지 않는다 */
export const bonusEditable = (c: { status: string; bonusClosedAt: Date | null }) => !LOCKED.includes(c.status) && !c.bonusClosedAt;


export async function listBonus(actor: Actor, cycleId: string): Promise<BonusRow[]> {
  assert(can.manageCycle(actor));
  const db = getDb();
  const people = await db
    .select({ id: cyclePeople.id, name: cyclePeople.name, email: cyclePeople.email, department: cyclePeople.department, formType: cyclePeople.formType })
    .from(cyclePeople)
    .where(and(eq(cyclePeople.cycleId, cycleId), eq(cyclePeople.isTarget, true)))
    .orderBy(cyclePeople.gradeGroup, cyclePeople.department, cyclePeople.name);
  const points = people.length ? await db.select().from(bonusPoints).where(inArray(bonusPoints.personId, people.map((p) => p.id))) : [];
  const by = new Map<string, Partial<BonusValues>>();
  for (const p of points) by.set(p.personId, { ...(by.get(p.personId) ?? {}), [p.item]: decNum(p.points) ?? 0 });
  return people.map((p) => {
    const v = by.get(p.id);
    const values = v ? (Object.fromEntries(BONUS_ITEMS.map((i) => [i.code, v[i.code] ?? 0])) as BonusValues) : null;
    return { id: p.id, name: p.name, email: p.email, department: p.department, isLeader: p.formType === "leader", values, total: values ? bonusTotal(values) : null };
  });
}

async function cycleOf(cycleId: string) {
  const [c] = await getDb().select().from(reviewCycles).where(eq(reviewCycles.id, cycleId)).limit(1);
  return c ?? null;
}

/** 여러 사람의 가점을 한 번에 반영 (템플릿). 항목 7개를 모두 덮어쓴다 */
export async function applyBonus(actor: Actor, cycleId: string, rows: { personId: string; values: BonusValues }[]): Promise<Result<{ count: number }>> {
  assert(can.manageCycle(actor));
  const c = await cycleOf(cycleId);
  if (!c || !bonusEditable(c)) return fail("locked", "평가등급이 확정되어 가점을 더 이상 인정하지 않습니다.");
  const roster = await listBonus(actor, cycleId);
  const ref = new Map(roster.map((r) => [r.id, r]));
  for (const r of rows) {
    const p = ref.get(r.personId);
    if (!p) return fail("invalid", "명단에 없는 사람이 있습니다.");
    const err = checkValues(r.values, p.isLeader);
    if (err) return fail("invalid", `${p.name}: ${err}`);
  }
  if (rows.length === 0) return ok({ count: 0 });
  await getDb().transaction(async (tx) => {
    // 바뀐 항목만 이력으로 남긴다 (직원 본인에게 "언제 무엇이 바뀌었는지" 보이기, 2026-10-15)
    const before = await tx.select().from(bonusPoints).where(inArray(bonusPoints.personId, rows.map((r) => r.personId)));
    const prev = new Map(before.map((b) => [`${b.personId}:${b.item}`, decNum(b.points) ?? 0]));
    const changes = rows.flatMap((r) =>
      BONUS_ITEMS.map((i) => ({ personId: r.personId, item: i.code, from: prev.get(`${r.personId}:${i.code}`), to: r.values[i.code as BonusCode] ?? 0 })).filter((c) => (c.from === undefined ? c.to !== 0 : Math.round(c.from * 100) !== Math.round(c.to * 100))),
    );
    if (changes.length)
      await tx.insert(bonusHistory).values(changes.map((c) => ({ personId: c.personId, item: c.item, fromPoints: c.from === undefined ? null : encNum(c.from), toPoints: encNum(c.to)!, changedBy: actor.email })));
    await tx.delete(bonusPoints).where(inArray(bonusPoints.personId, rows.map((r) => r.personId)));
    await tx.insert(bonusPoints).values(
      rows.flatMap((r) => BONUS_ITEMS.map((i) => ({ personId: r.personId, item: i.code, points: enc((r.values[i.code as BonusCode] ?? 0).toFixed(2)), updatedBy: actor.email }))),
    );
    if (c.status === "final_review") await recomputeFinal(tx, cycleId);
    await tx.insert(auditLogs).values({ actorEmail: actor.email, action: rows.length === 1 ? "bonus.set" : "bonus.upload", cycleId, personId: rows.length === 1 ? rows[0]!.personId : null, detail: { count: rows.length } });
  });
  return ok({ count: rows.length });
}

export async function bonusCount(actor: Actor, cycleId: string) {
  assert(can.manageCycle(actor));
  const [r] = await getDb()
    .select({ n: sql<number>`count(distinct ${bonusPoints.personId})::int` })
    .from(bonusPoints)
    .innerJoin(cyclePeople, eq(cyclePeople.id, bonusPoints.personId))
    .where(and(eq(cyclePeople.cycleId, cycleId), eq(cyclePeople.isTarget, true)));
  return r?.n ?? 0;
}

// ── 내 가점 (2026-10-15 피드백): 관리자가 넣는 즉시 본인이 확인하고, 틀리면 정정 요청 ──

export type MyBonus = {
  year: number;
  cutoff: string | null;
  locked: boolean;
  items: { code: string; label: string; points: number }[] | null;
  total: number | null;
  updatedAt: string | null;
  history: { at: string; label: string; from: number | null; to: number }[];
  requests: { id: string; at: string; message: string; status: "open" | "done"; reply: string | null }[];
};

const labelOf = Object.fromEntries(BONUS_ITEMS.map((i) => [i.code, i.label])) as Record<string, string>;

/** 본인 가점. 안내 메일을 보낸 뒤부터 보인다(관리자가 아직 안 넣었으면 items = null) */
export async function getMyBonus(actor: Actor): Promise<MyBonus | null> {
  if (!actor.personId) return null;
  const db = getDb();
  const [row] = await db.select({ p: cyclePeople, c: reviewCycles }).from(cyclePeople).innerJoin(reviewCycles, eq(reviewCycles.id, cyclePeople.cycleId)).where(eq(cyclePeople.id, actor.personId)).limit(1);
  if (!row || !row.p.isTarget || row.c.status === "setup") return null;
  const pts = await db.select().from(bonusPoints).where(eq(bonusPoints.personId, row.p.id));
  const by = new Map(pts.map((b) => [b.item as string, decNum(b.points) ?? 0]));
  const items = pts.length ? BONUS_ITEMS.filter((i) => !("leaderOnly" in i) || row.p.formType === "leader").map((i) => ({ code: i.code, label: i.label, points: by.get(i.code) ?? 0 })) : null;
  const hist = await db.select().from(bonusHistory).where(eq(bonusHistory.personId, row.p.id)).orderBy(desc(bonusHistory.createdAt)).limit(30);
  const reqs = await db.select().from(bonusRequests).where(eq(bonusRequests.personId, row.p.id)).orderBy(desc(bonusRequests.createdAt));
  return {
    year: row.c.year,
    cutoff: row.c.bonusCutoff,
    locked: !bonusEditable(row.c),
    items,
    total: items ? bonusTotal(Object.fromEntries(items.map((i) => [i.code, i.points]))) : null,
    updatedAt: hist[0]?.createdAt.toISOString() ?? null,
    history: hist.map((h) => ({ at: h.createdAt.toISOString(), label: labelOf[h.item] ?? h.item, from: decNum(h.fromPoints), to: decNum(h.toPoints)! })),
    requests: reqs.map((r) => ({ id: r.id, at: r.createdAt.toISOString(), message: dec(r.message), status: r.status, reply: r.reply ? dec(r.reply) : null })),
  };
}

/** 정정 요청: 내용은 암호화해 저장, 관리자에게는 "요청이 있다"만 메일로 알린다 (내용·점수는 메일에 넣지 않음) */
export async function requestBonusFix(actor: Actor, message: string): Promise<Result> {
  if (!actor.personId) return fail("forbidden", "평가 대상자만 요청할 수 있습니다.");
  const text = message.trim();
  if (text.length < 2) return fail("empty", "무엇이 틀렸는지 적어 주세요.");
  if (text.length > 500) return fail("long", "500자까지 쓸 수 있습니다.");
  const db = getDb();
  const [row] = await db.select({ p: cyclePeople, c: reviewCycles }).from(cyclePeople).innerJoin(reviewCycles, eq(reviewCycles.id, cyclePeople.cycleId)).where(eq(cyclePeople.id, actor.personId)).limit(1);
  if (!row || !row.p.isTarget || row.c.status === "setup") return fail("stage", "지금은 요청할 수 없습니다.");
  const open = await db.select({ id: bonusRequests.id }).from(bonusRequests).where(and(eq(bonusRequests.personId, row.p.id), eq(bonusRequests.status, "open")));
  if (open.length >= 3) return fail("too_many", "처리되지 않은 요청이 3건 있습니다. 처리된 뒤에 다시 요청해 주세요.");
  await db.transaction(async (tx) => {
    await tx.insert(bonusRequests).values({ personId: row.p.id, message: enc(text) });
    await tx.insert(auditLogs).values({ actorEmail: actor.email, action: "bonus.request", cycleId: row.c.id, personId: row.p.id, detail: {} });
    const admins = await tx.select({ email: appUsers.email }).from(appUsers).where(and(eq(appUsers.role, "admin"), eq(appUsers.active, true)));
    const batchId = crypto.randomUUID();
    if (admins.length)
      await tx.insert(emailOutbox).values(admins.map((a) => ({ cycleId: row.c.id, kind: "admin_alert" as const, toEmail: a.email, batchId, createdBy: actor.email, payload: { title: "가점 정정 요청이 들어왔습니다", year: String(row.c.year), actor: "직원 본인 (내용은 화면에서 확인)", path: "/admin/bonus" } })));
  });
  return ok();
}

export async function listBonusRequests(actor: Actor, cycleId: string) {
  assert(can.manageCycle(actor));
  const rows = await getDb()
    .select({ r: bonusRequests, name: cyclePeople.name, department: cyclePeople.department })
    .from(bonusRequests)
    .innerJoin(cyclePeople, eq(cyclePeople.id, bonusRequests.personId))
    .where(eq(cyclePeople.cycleId, cycleId))
    .orderBy(asc(bonusRequests.status), desc(bonusRequests.createdAt));
  return rows.map(({ r, name, department }) => ({ id: r.id, name, department, at: r.createdAt.toISOString(), message: dec(r.message), status: r.status, reply: r.reply ? dec(r.reply) : null, handledBy: r.handledBy }));
}

export async function handleBonusRequest(actor: Actor, id: string, reply: string): Promise<Result> {
  assert(can.manageCycle(actor));
  const text = reply.trim().slice(0, 500);
  const done = await getDb()
    .update(bonusRequests)
    .set({ status: "done", reply: text ? enc(text) : null, handledBy: actor.name, handledAt: new Date() })
    .where(and(eq(bonusRequests.id, id), eq(bonusRequests.status, "open")))
    .returning({ personId: bonusRequests.personId });
  if (!done.length) return fail("not_found", "이미 처리된 요청입니다.");
  await getDb().insert(auditLogs).values({ actorEmail: actor.email, action: "bonus.request_done", personId: done[0]!.personId, detail: {} });
  return ok();
}
