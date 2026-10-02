// 점수·등급 계산 (ADR-0014·0015, docs/tech/02 2-4). 입력 → 출력만 하는 순수 함수. 모든 계산은 1/100점 단위 정수로 한다.
import { FORMS, type FormType } from "./forms";
import { ACHIEVEMENT } from "./review";

export const GRADES = ["S", "A", "B", "C", "D"] as const;
export type Grade = (typeof GRADES)[number];
export const GROUP_LABEL: Record<number, string> = { 1: "1그룹 팀장", 2: "2그룹 부장", 3: "3그룹 차장", 4: "4그룹 과장", 5: "5그룹 대리이하" };
const RATIO: Record<Exclude<Grade, "B">, number> = { S: 5, A: 20, C: 15, D: 5 };

/** 0.5는 올림 (정수 백분율로 계산해 부동소수 오차 없음) */
const roundHalfUp = (n: number, pct: number) => Math.floor((n * pct * 2 + 100) / 200);

/** 그룹 인원별 등급 인원: S·A·C·D 반올림, B = 나머지. B가 음수면 C→A→D→S 순서로 1명씩 줄인다 */
export function gradeCounts(n: number): Record<Grade, number> {
  const c = { S: roundHalfUp(n, RATIO.S), A: roundHalfUp(n, RATIO.A), B: 0, C: roundHalfUp(n, RATIO.C), D: roundHalfUp(n, RATIO.D) };
  c.B = n - c.S - c.A - c.C - c.D;
  const order: Exclude<Grade, "B">[] = ["C", "A", "D", "S"];
  for (let i = 0; c.B < 0; i = (i + 1) % order.length) {
    const g = order[i]!;
    if (c[g] > 0) {
      c[g]--;
      c.B++;
    }
  }
  return c;
}

export type Scores = Record<string, number>;
export type ScoreResult =
  | { blank: true; missing: ("first" | "second")[] }
  | { blank: false; competency: number; achievement: number; firstTotal: number; secondTotal: number | null; bonus: number; final: number };

const h = (x: number) => Math.round(x * 100); // 점 → 1/100점

/**
 * 팀원: 역량 = Σ(1차×0.6 + 2차×0.4), 업적 = (1차×0.6 + 2차×0.4)×10
 * 팀장: 역량 = Σ 임원 점수, 업적 = 임원 점수×10 (임원 점수는 1차 칸에 저장)
 * 최종점수 = 역량×0.3 + 업적×0.7 + 가점. 1차·2차 점수(통보용)는 그 평가자 점수만으로 낸 역량×0.3 + 업적×0.7
 */
export function computeScores(form: FormType, first: Scores, second: Scores, bonus: number): ScoreResult {
  const codes = FORMS[form].map((i) => i.code);
  const all = [...codes, ACHIEVEMENT];
  const missing: ("first" | "second")[] = [];
  if (all.some((c) => !first[c])) missing.push("first");
  if (form === "member" && all.some((c) => !second[c])) missing.push("second");
  if (missing.length) return { blank: true, missing };

  // 역량·업적을 1/100점으로: 팀원은 (6f+4s)/10 을 정수로 다룬다
  const weighted = (c: string) => (form === "member" ? 6 * first[c]! + 4 * second[c]! : 10 * first[c]!); // ×10 배
  const comp100 = codes.reduce((s, c) => s + weighted(c), 0) * 10; // Σ/10 ×100
  const ach100 = weighted(ACHIEVEMENT) * 100; // (/10 ×10) ×100
  const single = (sc: Scores) => (codes.reduce((s, c) => s + sc[c]!, 0) * 100 * 3 + sc[ACHIEVEMENT]! * 1000 * 7) / 10;
  const bonus100 = h(bonus);
  const final100 = (comp100 * 3 + ach100 * 7) / 10 + bonus100;
  return {
    blank: false,
    competency: comp100 / 100,
    achievement: ach100 / 100,
    firstTotal: Math.round(single(first)) / 100,
    secondTotal: form === "member" ? Math.round(single(second)) / 100 : null,
    bonus: bonus100 / 100,
    final: Math.round(final100) / 100,
  };
}

export type Ranked = { id: string; final: number | null; hireDate: string; name: string };
export type DraftRow = { id: string; rank: number | null; grade: Grade | null; tieRule: boolean; percentile: number | null };

/**
 * 그룹 안에서 순위와 초안 등급. 점수가 높을수록 위, 같으면 근속이 긴(입사일이 이른) 사람이 위.
 * 등급 인원은 그룹 전체 인원으로 정한다. 점수 빈칸인 사람은 순위·등급이 없다.
 */
export function draftGrades(group: Ranked[]): DraftRow[] {
  const counts = gradeCounts(group.length);
  const scored = group.filter((p) => p.final !== null).sort((a, b) => b.final! - a.final! || a.hireDate.localeCompare(b.hireDate) || a.name.localeCompare(b.name, "ko"));
  const slots: Grade[] = GRADES.flatMap((g) => Array<Grade>(counts[g]).fill(g));
  const out = new Map<string, DraftRow>();
  scored.forEach((p, i) => {
    const prev = scored[i - 1];
    const grade = slots[i] ?? "D";
    const prevGrade = prev ? out.get(prev.id)!.grade : null;
    out.set(p.id, {
      id: p.id,
      rank: i + 1,
      grade,
      tieRule: !!prev && prev.final === p.final && prevGrade !== grade,
      percentile: Math.round(((i + 1) / group.length) * 1000) / 10,
    });
  });
  return group.map((p) => out.get(p.id) ?? { id: p.id, rank: null, grade: null, tieRule: false, percentile: null });
}

// ── 등급조정 (PRD 12) ──

export type Placed = { id: string; rank: number; grade: Grade; manual: boolean; percentile: number };
export type Move = { id: string; from: Grade; to: Grade; kind: "manual" | "push" };

/**
 * 한 사람의 등급을 바꾸면 등급별 인원을 지키려고 누가 한 칸씩 움직이는지.
 * 상향: 들어간 등급의 최하단부터 원래 등급까지 한 칸씩 아래로 (밀려남).
 * 하향: 들어간 등급의 최상단부터 원래 등급까지 한 칸씩 위로.
 * 이미 조정된 사람은 움직이지 않는다.
 */
export function planAdjust(list: Placed[], personId: string, to: Grade): { ok: true; moves: Move[] } | { ok: false; message: string } {
  const me = list.find((p) => p.id === personId);
  if (!me) return { ok: false, message: "대상자를 찾을 수 없습니다." };
  if (me.grade === to) return { ok: false, message: "지금과 같은 등급입니다." };
  const i1 = GRADES.indexOf(me.grade);
  const i2 = GRADES.indexOf(to);
  const moves: Move[] = [{ id: me.id, from: me.grade, to, kind: "manual" }];
  const moved = new Set([me.id]);
  const step = i2 < i1 ? 1 : -1; // 상향이면 아래로 밀고, 하향이면 위로 당긴다
  for (let k = i2; k !== i1; k += step) {
    const g = GRADES[k]!;
    const pool = list.filter((p) => p.grade === g && !p.manual && !moved.has(p.id)).sort((a, b) => a.rank - b.rank);
    const pick = step === 1 ? pool[pool.length - 1] : pool[0];
    if (!pick) return { ok: false, message: `${g} 등급에 옮길 수 있는 사람이 없습니다. 먼저 다른 조정을 되돌려 주세요.` };
    moves.push({ id: pick.id, from: g, to: GRADES[k + step]!, kind: "push" });
    moved.add(pick.id);
  }
  return { ok: true, moves };
}

/**
 * 통보용 상위 % (조정 반영): 등급이 좋은 순서 → 같은 등급 안에서는 점수 순서로 줄을 세운 자리 ÷ 그룹 인원.
 * 하향 조정된 사람은 새 등급의 맨 위, 상향 조정된 사람은 새 등급의 맨 아래에 선다.
 * 그래서 보통은 "하향 → 그 등급 최상위자, 상향 → 최하위자의 값"과 같고, 등급과 % 순서가 어긋나지 않는다.
 */
export function displayPercentiles(list: (Placed & { draft: Grade })[], groupSize: number): Map<string, number> {
  const g = (x: Grade) => GRADES.indexOf(x);
  const bias = (p: Placed & { draft: Grade }) => (!p.manual ? 0 : g(p.grade) > g(p.draft) ? -1 : g(p.grade) < g(p.draft) ? 1 : 0);
  const order = [...list].sort((a, b) => g(a.grade) - g(b.grade) || bias(a) - bias(b) || a.rank - b.rank);
  return new Map(order.map((p, i) => [p.id, Math.round(((i + 1) / groupSize) * 1000) / 10]));
}
