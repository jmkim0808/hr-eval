// 2026-10-15 두 번째 피드백: 대표이사 조정(S~D 자유), 평가자에게 가점 표시, 1차·2차 평가의견, 지난 평가 기록(본인·당시 평가자).
import { BASE, browser, check, D, E, login, sql, summary } from "./helpers";

await sql`delete from email_outbox`;
await sql`delete from cycle_people`;
await sql`delete from review_cycles`;
await sql`delete from auth_codes`;
await sql`insert into app_users (email, name, role) values ('ceo@powernet.test', '대표이사', 'ceo') on conflict (email) do update set role = 'ceo', active = true`;
const year = Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "numeric" }).format(new Date()));
const ITEMS = ["responsibility", "teamwork", "discipline", "objectivity", "execution", "knowledge", "information", "contribution", "communication", "trust", "achievement"];

async function cycle(y: number, status: string) {
  const [c] = await sql`insert into review_cycles (year, status, self_start, self_end, first_start, first_end, second_start, second_end, bonus_cutoff, invited_at, closed_at)
    values (${y}, ${status}, '2026-09-01', '2026-09-05', '2026-09-08', '2026-12-30', '2026-12-31', '2026-12-31', '2026-09-05', now(), ${status === "closed" ? new Date() : null}) returning id`;
  return c!.id as string;
}
const mk = (cycleId: string) => async (v: Record<string, unknown>) => {
  const [r] = await sql`insert into cycle_people ${sql({ cycle_id: cycleId, department: "영업1팀", position: "대리", hire_date: "2020-01-01", ...v })} returning id`;
  return r!.id as string;
};
async function evalOf(personId: string, ach: string, extra: Record<string, unknown> = {}) {
  const [ev] = await sql`insert into evaluations ${sql({ person_id: personId, achievement_text: E(ach), improvement_text: E("내년 계획"), self_submitted_at: new Date(), version: 1, ...extra })} returning id`;
  return ev!.id as string;
}
async function scores(evId: string, rater: "self" | "first" | "second", v: number) {
  for (const c of ITEMS) if (!(rater === "self" && c === "achievement")) await sql`insert into evaluation_scores (evaluation_id, rater, item_code, score) values (${evId}, ${rater}, ${c}, ${E(rater === "self" ? Math.round(v) : v)})`;
}

// ── 지난해(마감) ──
const past = await cycle(year - 1, "closed");
const pp = mk(past);
const pEx = await pp({ email: "exec@powernet.test", employee_no: "H900", name: "정임원", position: "상무", department: "", is_executive: true, is_target: false });
const pLd = await pp({ email: "lead@powernet.test", employee_no: "H901", name: "최팀장", position: "부장", is_team_leader: true, grade_group: 1, form_type: "leader", first_reviewer_id: pEx });
const pLd2 = await pp({ email: "lead2@powernet.test", employee_no: "H905", name: "한팀장", position: "부장", department: "품질팀", is_team_leader: true, grade_group: 1, form_type: "leader", first_reviewer_id: pEx });
const pKim = await pp({ email: "kim@powernet.test", employee_no: "H902", name: "김대리", grade_group: 5, form_type: "member", first_reviewer_id: pLd, second_reviewer_id: pEx });
const pPark = await pp({ email: "park@powernet.test", employee_no: "H903", name: "박과장", department: "품질팀", position: "과장", grade_group: 4, form_type: "member", first_reviewer_id: pLd2, second_reviewer_id: pEx });
const pev = await evalOf(pKim, "지난해 수주 30억 달성", { first_comment: E("지난해 1차 의견: 성실함"), second_comment: E("지난해 2차 의견: 리더십 보완") });
await scores(pev, "self", 8);
await scores(pev, "first", 8.5);
await scores(pev, "second", 6.5);
await evalOf(pPark, "박과장 지난해 업적");
await sql`insert into final_results ${sql({ person_id: pKim, cycle_id: past, first_total: E("85.00"), second_total: E("65.00"), bonus_total: E("1.50"), final_score: E("78.50"), group_rank: E("1"), draft_grade: E("B"), final_grade: E("A"), change_kind: E("adjusted"), display_percentile: E("20.0") })}`;
await sql`insert into bonus_points (person_id, item, points) values (${pKim}, 'certificate', ${E(1.5)})`;

// ── 올해 (1차평가 중) ──
const cur = await cycle(year, "first_review");
const cp = mk(cur);
const ex = await cp({ email: "exec@powernet.test", employee_no: "H900", name: "정임원", position: "상무", department: "", is_executive: true, is_target: false });
const ld = await cp({ email: "lead@powernet.test", employee_no: "H901", name: "최팀장", position: "부장", is_team_leader: true, grade_group: 1, form_type: "leader", first_reviewer_id: ex });
const kim = await cp({ email: "kim@powernet.test", employee_no: "H902", name: "김대리", grade_group: 5, form_type: "member", first_reviewer_id: ld, second_reviewer_id: ex });
await cp({ email: "park@powernet.test", employee_no: "H903", name: "박과장", department: "품질팀", position: "과장", grade_group: 4, form_type: "member", first_reviewer_id: ld, second_reviewer_id: ex });
const kev = await evalOf(kim, "올해 업적");
await scores(kev, "self", 8);
const others: string[] = [];
for (const [i, n] of ["가나", "다라", "마바", "사아"].entries()) {
  const id = await cp({ email: `m${i}@powernet.test`, employee_no: `H91${i}`, name: n, grade_group: 5, form_type: "member", first_reviewer_id: ld, second_reviewer_id: ex });
  const e = await evalOf(id, "업적");
  await scores(e, "first", 9 - i);
  await scores(e, "second", 9 - i);
  others.push(id);
}
await sql`insert into bonus_points (person_id, item, points) values (${kim}, 'award', ${E(2)}), (${kim}, 'certificate', ${E(0.5)})`;

const b = await browser();
const page = async (email: string) => {
  const p = await (await b.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
  await login(p, email);
  return p;
};

// ── 평가자에게 가점 표시 ──
const lead = await page("lead@powernet.test");
await lead.goto(`${BASE}/me/review/first/${kim}`);
await lead.getByTestId("reviewer-bonus").waitFor();
await check("[1차 평가자] 평가 화면에 가점 표(합계·항목)가 보인다", async () => {
  const t = await lead.getByTestId("reviewer-bonus").innerText();
  return t.includes("2.5점") && t.includes("포상 2") && t.includes("자격증 0.5") && t.includes("잠정치");
});

// ── 1차 평가의견 ──
await lead.fill("#review-comment", "올해 1차 의견: 수주 기여 큼");
await lead.getByText(/저장됨/).waitFor({ timeout: 10000 }).catch(() => null);
await check("[1차 평가자] 평가의견을 적으면 저절로 저장되고 암호화되어 들어간다", async () => {
  const [r] = await sql`select first_comment from evaluations where person_id = ${kim}`;
  return String(r!.first_comment).startsWith("e1:") && D(r!.first_comment as string) === "올해 1차 의견: 수주 기여 큼";
});
await lead.goto(`${BASE}/me/review/first`);
await check("[1차 평가자] 내 평가 현황에 가점 칸이 있다", async () => (await lead.locator('tr[data-person="김대리"] [data-bonus]').innerText()).trim() === "2.5");

// ── 2차 평가자: 1차 의견 보기 + 2차 의견 ──
await sql`update review_cycles set status = 'second_review', version = version + 1 where id = ${cur}`;
await scores(kev, "first", 8);
await sql`update evaluations set first_submitted_at = now() where person_id = ${kim}`;
const exe = await page("exec@powernet.test");
await exe.goto(`${BASE}/me/review/second/${kim}`);
await exe.locator("#review-comment").waitFor();
await check("[2차 평가자] 1차 평가의견과 가점이 보인다", async () => {
  const t = await exe.locator("main").innerText();
  return t.includes("올해 1차 의견: 수주 기여 큼") && (await exe.getByTestId("reviewer-bonus").innerText()).includes("2.5점");
});
for (const i of await exe.locator('input[inputmode="decimal"]').all()) await i.fill("7");
await exe.fill("#review-comment", "올해 2차 의견: 꼼꼼함");
await exe.getByText(/저장됨/).waitFor({ timeout: 10000 }).catch(() => null);
await exe.waitForTimeout(1500);
await lead.goto(`${BASE}/me/review/first/${kim}`);
await check("[1차 평가자] 2차 평가의견은 화면·원본 어디에도 없다", async () => !(await lead.content()).includes("꼼꼼함"));

// ── 대표이사 조정 ──
const adm = await page("part@powernet.test");
await adm.goto(`${BASE}/admin`);
await adm.getByRole("button", { name: "다음 단계로 넘기기" }).click();
await adm.getByRole("button", { name: "넘기기", exact: true }).click();
await adm.waitForTimeout(2000);
const ceo = await page("ceo@powernet.test");
await ceo.goto(`${BASE}/report?group=5`);
const ceoGrade = async (n: string) => (await ceo.locator(`tr[data-person="${n}"] [data-grade]`).innerText()).trim();
const before = Object.fromEntries(await Promise.all(["가나", "다라", "마바", "사아", "김대리"].map(async (n) => [n, await ceoGrade(n)])));
await ceo.getByRole("combobox", { name: "가나 대표이사 조정" }).selectOption("D");
await ceo.waitForTimeout(2000);
await check("[대표이사] 등급별 비중과 상관없이 S~D 중 골라 바로 바꾸고, 다른 사람은 움직이지 않는다", async () => {
  const after = Object.fromEntries(await Promise.all(["가나", "다라", "마바", "사아", "김대리"].map(async (n) => [n, await ceoGrade(n)])));
  return before["가나"] !== "D" && after["가나"] === "D" && ["다라", "마바", "사아", "김대리"].every((n) => after[n] === before[n]) && (await ceo.locator('tr[data-person="가나"]').getByText("대표 조정 · 하향").count()) === 1;
});
await adm.goto(`${BASE}/admin/final?group=5`);
await check("[관리자] 최종평가 화면에 '대표이사 직접'으로 표시되고 최종 등급이 D다", async () => {
  const row = adm.locator('tr[data-person="가나"]');
  return (await row.innerText()).includes("대표이사 직접") && (await row.getByRole("combobox", { name: "가나 대표이사 조정" }).inputValue()) === "D";
});
await adm.getByRole("combobox", { name: "다라 대표이사 조정" }).selectOption("S");
await adm.waitForTimeout(2000);
await adm.reload();
await check("[관리자] 대표 지시를 대신 넣으면 '관리자 대신 입력'으로 기록되고 대표이사 화면에도 반영된다", async () => {
  await ceo.reload();
  const [l] = await sql`select detail from audit_logs where action = 'grade.ceo_adjust' order by created_at desc limit 1`;
  return (await adm.locator('tr[data-person="다라"]').innerText()).includes("관리자 대신 입력") && (await ceoGrade("다라")) === "S" && (l!.detail as { proxy: boolean }).proxy === true;
});
await adm.getByRole("combobox", { name: "다라 대표이사 조정" }).selectOption("");
await adm.waitForTimeout(2000);
await ceo.reload();
await check("'조정 없음'을 고르면 대표이사 조정이 지워지고 원래 등급으로 돌아간다", async () => (await ceoGrade("다라")) === before["다라"]);

// ── 결과지: 대표이사 조정 등급 + 평가의견, 조정 여부는 안 보임 ──
await adm.goto(`${BASE}/admin/final?group=5`);
await adm.getByRole("combobox", { name: "김대리 대표이사 조정" }).selectOption("S");
await adm.waitForTimeout(2000);
await sql`update review_cycles set status = 'results_sent', confirmed_at = now(), version = version + 1 where id = ${cur}`;
const me = await page("kim@powernet.test");
await me.goto(`${BASE}/me/result`);
await check("[직원] 내 평가결과에 대표이사 조정 등급이 최종으로 나오고, 1차·2차 평가의견이 보이며 조정 여부는 없다", async () => {
  const t = await me.locator("main").innerText();
  return (await me.getByTestId("my-grade").innerText()).trim() === "S" && t.includes("올해 1차 의견: 수주 기여 큼") && t.includes("올해 2차 의견: 꼼꼼함") && !/조정|밀려남/.test(t);
});

// ── 지난 평가 기록 ──
await me.goto(`${BASE}/me/history`);
await check("[직원] 지난 평가 기록에 지난해·올해가 보인다", async () => (await me.locator(`[data-year="${year - 1}"]`).count()) === 1 && (await me.locator(`[data-year="${year}"]`).count()) === 1);
await me.goto(`${BASE}/me/history/${pKim}`);
await check("[직원] 지난해 내 평가지(업적 글)·등급·최종점수·평가의견이 보이고, 평가자 항목별 점수와 조정 여부는 없다", async () => {
  const t = await me.locator("main").innerText();
  const head = await me.getByTestId("history-scores").locator("thead").innerText();
  return t.includes("지난해 수주 30억 달성") && t.includes("78.50") && (await me.getByTestId("history-result").innerText()).includes("A") && t.includes("지난해 1차 의견") && t.includes("지난해 2차 의견") && !head.includes("1차") && !/조정|밀려남/.test(t);
});
await lead.goto(`${BASE}/me/history`);
await check("[당시 1차 평가자] 지난 기록에 그 해 평가한 사람이 보인다 (평가하지 않은 사람은 없음)", async () => {
  const t = await lead.getByTestId(`reviewed-${year - 1}`).innerText();
  return t.includes("김대리") && !t.includes("박과장");
});
await lead.goto(`${BASE}/me/history/${pKim}`);
await check("[당시 1차 평가자] 평가지(업적)·1차 점수·1차 의견·등급·가점이 보이고 2차 점수·의견은 원본에도 없다", async () => {
  const t = await lead.locator("main").innerText();
  const html = await lead.content();
  return t.includes("지난해 수주 30억 달성") && t.includes("지난해 1차 의견") && t.includes("78.50") && t.includes("1.5") && !html.includes("지난해 2차 의견") && !html.includes("65.00") && !html.includes("6.5<");
});
const r404 = await lead.goto(`${BASE}/me/history/${pPark}`);
await check("[당시 1차 평가자] 그 해 평가하지 않은 사람의 기록은 열리지 않는다", async () => r404?.status() === 404);
await exe.goto(`${BASE}/me/history/${pKim}`);
await check("[당시 2차 평가자] 1차·2차 점수와 의견이 모두 보인다", async () => {
  const t = await exe.locator("main").innerText();
  return t.includes("지난해 2차 의견") && t.includes("65.00") && t.includes("지난해 1차 의견");
});
await check("지난 기록을 열면 작업 기록에 남는다", async () => {
  const [r] = await sql`select count(*)::int n from audit_logs where action = 'history.view'`;
  return r!.n >= 3;
});
void pLd2;
void others;

await b.close();
await sql.end();
process.exit(summary());
