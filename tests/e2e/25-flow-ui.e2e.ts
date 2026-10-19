// 2026-10-19 화면 개편: "한 장씩"(기본) 흐름 — 본인 평가지·평가하기를 카드로 끝까지, 흐름 레일 이동, 숫자키, 0.1점 조절, 그림 화면.
import { BASE, browser, check, D, login, sql, summary } from "./helpers";

await sql`delete from email_outbox`;
await sql`delete from cycle_people`;
await sql`delete from review_cycles`;
await sql`delete from auth_codes`;
const year = Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "numeric" }).format(new Date()));
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
const plus = (d: number) => new Date(Date.parse(today) + d * 86400000).toISOString().slice(0, 10);
const [cyc] = await sql`insert into review_cycles (year, status, self_start, self_end, first_start, first_end, second_start, second_end, bonus_cutoff, invited_at)
  values (${year}, 'self_review', ${plus(-1)}, ${plus(3)}, ${plus(4)}, ${plus(7)}, ${plus(8)}, ${plus(11)}, ${plus(3)}, now()) returning id`;
const cycleId = cyc!.id as string;
let no = 0;
const person = async (v: Record<string, unknown>) => {
  const [r] = await sql`insert into cycle_people ${sql({ cycle_id: cycleId, department: "영업1팀", position: "대리", hire_date: "2020-01-01", employee_no: `K${String(++no).padStart(3, "0")}`, ...v })} returning id`;
  return r!.id as string;
};
const ex = await person({ email: "exec@powernet.test", name: "정임원", position: "상무", department: "", is_executive: true, is_target: false });
const ld = await person({ email: "lead@powernet.test", name: "최팀장", position: "부장", is_team_leader: true, grade_group: 1, form_type: "leader", first_reviewer_id: ex });
const kim = await person({ email: "kim@powernet.test", name: "김대리", grade_group: 5, form_type: "member", first_reviewer_id: ld, second_reviewer_id: ex });
void ld;

const b = await browser();
const me = await (await b.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
await login(me, "kim@powernet.test", "card");
await me.goto(`${BASE}/me/form/${kim}`);
await me.getByTestId("flow-card").waitFor();
await check("[본인] 평가지는 기본이 '한 장씩'이고 왼쪽에 전체 흐름(0/12)이 보인다", async () =>
  (await me.getByTestId("flow-card").getAttribute("data-step")) === "responsibility" && (await me.getByTestId("flow-count").innerText()).replace(/\s/g, "") === "0/12",
);
await me.keyboard.press("8");
await me.waitForTimeout(200);
await check("[본인] 숫자키로 점수를 고르면 다음 항목으로 넘어간다", async () => (await me.getByTestId("flow-card").getAttribute("data-step")) === "teamwork");
await me.getByTestId("flow-rail").getByRole("button", { name: /신뢰성/ }).click();
await check("[본인] 흐름 레일에서 항목을 누르면 그 장으로 바로 간다", async () => (await me.getByTestId("flow-card").getAttribute("data-step")) === "trust");
await me.getByRole("button", { name: "9점" }).click();
await me.getByTestId("flow-rail").getByRole("button", { name: /팀워크/ }).click();
for (let i = 0; i < 8; i++) {
  await me.keyboard.press("7");
  await me.waitForTimeout(120);
}
await me.getByTestId("card-next").click(); // 신뢰성은 이미 9점 → 다음
await check("[본인] 역량 10칸을 채우면 업적 글 장이 나온다", async () => (await me.getByTestId("flow-card").getAttribute("data-step")) === "achievement");
await me.fill("#achievement", "올해 신규 거래처 3곳 확보, 수주 12억");
await me.getByTestId("card-next").click();
await me.fill("#improvement", "내년에는 해외 거래처를 늘리겠습니다");
await me.getByTestId("card-next").click();
await check("[본인] 확인 장에 '다 채웠어요'와 요약이 보이고 흐름은 12/12", async () => (await me.getByTestId("flow-card").innerText()).includes("다 채웠어요") && (await me.getByTestId("flow-count").innerText()).replace(/\s/g, "") === "12/12");
await me.getByRole("button", { name: "한눈에 보기" }).click();
await check("[본인] [한눈에 보기]로 바꾸면 모든 항목이 한 화면에 보인다", async () => (await me.locator('[role="group"][aria-labelledby^="label-"]').count()) === 10 && (await me.locator("#achievement").inputValue()).includes("12억"));
await me.getByRole("button", { name: "한 장씩" }).click();
await me.getByTestId("flow-rail").getByRole("button", { name: /확인 · 제출/ }).click();
await me.getByRole("button", { name: "제출", exact: true }).click();
await me.waitForURL(`${BASE}/me`, { timeout: 15000 }).catch(() => null);
await check("[본인] 한 장씩으로 제출하면 저장·제출된다 (점수 8·7·9, 업적 글)", async () => {
  const [ev] = await sql`select e.id, e.self_submitted_at, e.achievement_text from evaluations e where e.person_id = ${kim}`;
  const s = await sql`select item_code, score from evaluation_scores where evaluation_id = ${ev!.id} and rater = 'self'`;
  const by = Object.fromEntries(s.map((r) => [r.item_code, D(r.score as string)]));
  return !!ev?.self_submitted_at && D(ev.achievement_text as string).includes("12억") && s.length === 10 && by.responsibility === "8" && by.trust === "9" && by.teamwork === "7";
});

// ── 평가하기 (한 장씩) ──
await sql`update review_cycles set status = 'first_review', version = version + 1 where id = ${cycleId}`;
const lead = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
await login(lead, "lead@powernet.test", "card");
await lead.goto(`${BASE}/me/review/first/${kim}`);
await lead.getByTestId("flow-card").waitFor();
await check("[평가자] 위쪽에 맡은 사람 띠, 카드에 본인평가 점수 표시와 오른쪽 업적·가점이 보인다", async () => {
  const t = await lead.locator("main").innerText();
  return (await lead.getByRole("navigation", { name: "평가할 사람" }).count()) === 1 && t.includes("본인평가 8점") && t.includes("본인이 쓴 업적") && (await lead.getByTestId("reviewer-bonus").count()) === 1;
});
for (let i = 0; i < 11; i++) {
  await lead.keyboard.press("8");
  await lead.waitForTimeout(150);
  if (i < 10) {
    await lead.keyboard.press("Enter");
    await lead.waitForTimeout(150);
  }
}
await lead.getByRole("button", { name: "0.1점 올리기" }).click();
await lead.waitForTimeout(200);
await check("[평가자] 숫자키 + Enter로 넘기고, 업적에서 0.1점 올리면 8.1이 된다", async () => (await lead.getByTestId("flow-card").getAttribute("data-step")) === "achievement" && (await lead.getByTestId("flow-card").innerText()).includes("8.1"));
await lead.getByTestId("card-next").click();
await lead.fill("#review-comment", "카드로 쓴 1차 의견");
await lead.getByTestId("card-next").click();
await lead.getByRole("button", { name: "제출", exact: true }).click();
await lead.waitForURL(/\/me\/review\/first(\?|$)/, { timeout: 15000 }).catch(() => null);
await check("[평가자] 한 장씩으로 제출하면 점수(업적 8.1)·의견이 저장되고 내 평가 현황으로 간다", async () => {
  const [ev] = await sql`select id, first_submitted_at, first_comment from evaluations where person_id = ${kim}`;
  const [a] = await sql`select score from evaluation_scores where evaluation_id = ${ev!.id} and rater = 'first' and item_code = 'achievement'`;
  return !!ev?.first_submitted_at && D(a!.score as string) === "8.1" && D(ev.first_comment as string) === "카드로 쓴 1차 의견";
});
await lead.goto(`${BASE}/me/review/first`);
await check("[평가자] 내 평가 현황에 숫자 카드와 '내가 준 점수 분포' 그림이 보인다", async () => (await lead.getByTestId("score-strip").count()) === 1 && (await lead.locator("main").innerText()).includes("내 평균"));

const adm = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
await login(adm, "part@powernet.test");
await adm.goto(`${BASE}/admin`);
await check("[관리자] 진행 현황에 부서별 진행 막대와 역량×업적 9칸 표(점 1개)가 보인다", async () =>
  (await adm.getByTestId("dept-progress").innerText()).includes("영업1팀") && (await adm.locator('[data-testid="nine-box"] circle').count()) === 1,
);

await b.close();
await sql.end();
process.exit(summary());
