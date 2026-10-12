// 최종평가 한 줄의 암호화/복호화 (ADR-0021). DB에는 암호문, 코드 안에서는 예전과 같은 평문 모양으로 다룬다.
import type { Grade } from "@/domain/grading";
import type { finalResults } from "@/server/db/schema";
import { decOpt, encOpt } from "@/server/crypto/vault";

type Row = typeof finalResults.$inferSelect;
export type ChangeKind = "none" | "adjusted" | "pushed";

/** 평문 모양: 점수는 "85.20" 같은 글(예전 numeric 열과 같음), 순위는 숫자 */
export type FinalPlain = Omit<Row, "groupRank" | "draftGrade" | "finalGrade" | "tieRule" | "changeKind" | "recalcFrom"> & {
  groupRank: number | null;
  draftGrade: Grade | null;
  finalGrade: Grade | null;
  tieRule: boolean;
  changeKind: ChangeKind;
  recalcFrom: Grade | null;
};

const TEXT = ["competencyScore", "achievementScore", "firstTotal", "secondTotal", "bonusTotal", "finalScore", "displayPercentile", "draftGrade", "finalGrade", "recalcFrom", "changeKind"] as const;

export function decFinal(r: Row): FinalPlain {
  const out = { ...r } as Record<string, unknown>;
  for (const k of TEXT) out[k] = decOpt(r[k]);
  out.groupRank = r.groupRank === null ? null : Number(decOpt(r.groupRank));
  out.tieRule = decOpt(r.tieRule) === "1";
  out.changeKind = (out.changeKind as string | null) ?? "none";
  return out as FinalPlain;
}

/** 넣거나 고칠 값만 암호화한다 (없는 키는 그대로 없음) */
export function encFinal<T extends Partial<FinalPlain>>(p: T): Partial<Row> {
  const out = { ...p } as Record<string, unknown>;
  for (const k of TEXT) if (k in p) out[k] = encOpt(p[k] as string | null);
  if ("groupRank" in p) out.groupRank = p.groupRank === null || p.groupRank === undefined ? null : encOpt(String(p.groupRank));
  if ("tieRule" in p) out.tieRule = encOpt(p.tieRule ? "1" : "0");
  return out as Partial<Row>;
}
