// PRD 10 확인 문장을 화면에서 점검한다. 가짜 명단.
import { BASE, browser, check, login, sql, summary } from "./helpers";

await sql`delete from email_outbox`;
await sql`delete from cycle_people`;
await sql`delete from review_cycles`;
await sql`delete from auth_codes`;
const year = Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "numeric" }).format(new Date()));
const [cyc] = await sql`insert into review_cycles (year, status, self_start, self_end, first_start, first_end, second_start, second_end, bonus_cutoff)
  values (${year}, 'second_review', '2026-09-01', '2026-09-05', '2026-09-08', '2026-09-12', '2026-09-15', '2026-09-19', '2026-09-05') returning id`;
const cycleId = cyc!.id as string;
const person = async (v: Record<string, unknown>) => {
  const [r] = await sql`insert into cycle_people ${sql({ cycle_id: cycleId, department: "영업1팀", position: "대리", hire_date: "2020-01-01", ...v })} returning id`;
  return r!.id as string;
};
const MEMBER = ["responsibility", "teamwork", "discipline", "objectivity", "execution", "knowledge", "information", "contribution", "communication", "trust"];
async function scores(personId: string, rater: "first" | "second", items: number[], ach: number) {
  const [ev] = await sql`insert into evaluations (person_id, self_submitted_at, version) values (${personId}, now(), 1) on conflict (person_id) do update set version = evaluations.version returning id`;
  await sql`update evaluations set ${sql(rater === "first" ? { first_submitted_at: new Date() } : { second_submitted_at: new Date() })} where id = ${ev!.id}`;
  for (let i = 0; i < MEMBER.length; i++) await sql`insert into evaluation_scores (evaluation_id, rater, item_code, score) values (${ev!.id}, ${rater}, ${MEMBER[i]!}, ${items[i]!})`;
  await sql`insert into evaluation_scores (evaluation_id, rater, item_code, score) values (${ev!.id}, ${rater}, 'achievement', ${ach})`;
}
const ex = await person({ email: "exec@powernet.test", name: "정임원", position: "상무", department: "", is_executive: true, is_target: false });
const ld = await person({ email: "lead@powernet.test", name: "최팀장", position: "부장", is_team_leader: true, grade_group: 1, form_type: "leader", first_reviewer_id: ex });
await sql`insert into evaluations (person_id, version) values (${ld}, 1)`;
await scores(ld, "first", [9, 9, 9, 9, 9, 9, 9, 9, 9, 9].map((x, i) => (i === 4 ? 8 : x)), 9); // 팀장용은 항목 코드가 달라 일부만 맞음 → 빈칸

// 5그룹 10명: [이름, 1차 항목, 2차 항목, 1차 업적, 2차 업적, 가점, 입사일]
const g5: [string, number, number, number, number, number, string][] = [
  ["가나", 10, 9, 10, 9, 0, "2015-01-01"],
  ["나다", 9, 9, 9, 9, 0, "2015-01-01"],
  ["다라", 9, 8, 8, 8, 0, "2021-01-01"], // 동점 (늦게 입사)
  ["라마", 9, 8, 8, 8, 0, "2012-01-01"], // 동점 (먼저 입사)
  ["마바", 8, 8, 8, 8, 0, "2015-01-01"],
  ["바사", 8, 7, 7, 7, 0.5, "2015-01-01"],
  ["사아", 7, 7, 7, 7, 0, "2015-01-01"],
  ["아자", 7, 6, 6, 6, 0, "2015-01-01"],
  ["자차", 6, 6, 6, 6, -1, "2015-01-01"],
  ["차카", 5, 5, 5, 5, 0, "2015-01-01"],
];
const id5: Record<string, string> = {};
for (const [name, f, s, fa, sa, b, hire] of g5) {
  const id = await person({ email: `${name}@powernet.test`, name, grade_group: 5, form_type: "member", hire_date: hire, first_reviewer_id: ld, second_reviewer_id: ex });
  id5[name] = id;
  await scores(id, "first", Array(10).fill(f), fa);
  await scores(id, "second", Array(10).fill(s), sa);
  if (b) {
    for (const item of ["certificate", "award", "invention", "education", "discipline", "internal_control", "multi_rater"]) {
      const v = item === "discipline" ? Math.min(b, 0) : item === "certificate" ? Math.max(b, 0) : 0;
      await sql`insert into bonus_points (person_id, item, points) values (${id}, ${item}, ${v})`;
    }
  }
}
// 4그룹: 2차 점수가 빈 사람
const blank = await person({ email: "blank@powernet.test", name: "빈칸이", grade_group: 4, position: "과장", form_type: "member", first_reviewer_id: ld, second_reviewer_id: ex });
await scores(blank, "first", Array(10).fill(7), 7);

const b = await browser();
const page = await b.newPage({ viewport: { width: 1400, height: 1000 } });
await login(page, "part@powernet.test");
await page.goto(`${BASE}/admin/final`);
await check("넘기기 전에는 \"2차평가가 끝나면 초안이 나옵니다 (남은 인원 N명)\"이 보인다", async () => (await page.getByText("2차평가가 끝나면 초안이 나옵니다 (남은 인원 1명)").count()) === 1);

await page.goto(`${BASE}/admin`);
await page.getByRole("button", { name: "다음 단계로 넘기기" }).click();
await page.getByRole("button", { name: "넘기기", exact: true }).click();
await page.waitForTimeout(1500);
await page.goto(`${BASE}/admin/final?group=5`);
const names = await page.locator("tbody tr td:nth-child(2)").allInnerTexts();
const finals = (await page.locator("tbody tr td:nth-child(8)").allInnerTexts()).map(Number);
await check("넘긴 뒤 그룹을 고르면 그 그룹 사람이 최종점수 순서로 보인다", async () => names.length === 10 && finals.every((v, i) => i === 0 || finals[i - 1]! >= v));
await check("10명 그룹이면 등급별 인원이 S 1 · A 2 · B 4 · C 2 · D 1로 보인다", async () => (await page.getByTestId("grade-counts").innerText()).includes("S 1 · A 2 · B 4 · C 2 · D 1"));
const row = (n: string) => page.locator(`tr[data-person="${n}"]`);
await check("같은 점수가 등급 경계에 걸리면 입사일이 늦은 사람이 아래 등급이고 \"동점 — 근속으로 하향\"이 보인다", async () => {
  const a = await row("라마").locator("td").allInnerTexts();
  const c = await row("다라").locator("td").allInnerTexts();
  return a[7] === c[7] && a[8] === "A" && c[8] === "B" && c[9]!.includes("동점 — 근속으로 하향") && !a[9]!.includes("동점");
});
// 엑셀 양식 수식으로 계산: N4=SUM(R), R=P×60%+Q×40%, N5=(O25×60%+Q25×40%)×10, Q4=N4×0.3+N5×0.7+P4
const excel = (f: number, s: number, fa: number, sa: number, b: number) => {
  const n4 = 10 * (f * 0.6 + s * 0.4);
  const n5 = (fa * 0.6 + sa * 0.4) * 10;
  return (n4 * 0.3 + n5 * 0.7 + b).toFixed(2);
};
await check("팀원의 최종점수 = 역량×0.3 + 업적×0.7 + 가점이 엑셀 양식으로 계산한 값과 같다(샘플 3명)", async () => {
  const out: boolean[] = [];
  for (const n of ["가나", "바사", "자차"]) {
    const [, f, s, fa, sa, bb] = g5.find((g) => g[0] === n)!;
    out.push((await row(n).locator("td").nth(7).innerText()) === excel(f, s, fa, sa, bb));
  }
  return out.every(Boolean);
});
await page.screenshot({ path: "/tmp/hr-e2e/10-final.png", fullPage: true });
await page.goto(`${BASE}/admin/final?group=4`);
await check("평가자 점수가 빈 사람은 등급 대신 \"점수 빈칸 — 대신 입력 필요\"가 보인다", async () => (await row("빈칸이").getByText("점수 빈칸 — 대신 입력 필요").count()) === 1);

await b.close();
await sql.end();
process.exit(summary());
