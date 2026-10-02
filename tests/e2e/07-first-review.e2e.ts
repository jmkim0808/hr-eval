// PRD 07 확인 문장을 화면에서 점검한다. 가짜 명단.
import { BASE, browser, check, login, sql, summary } from "./helpers";

await sql`delete from email_outbox`;
await sql`delete from cycle_people`;
await sql`delete from review_cycles`;
await sql`delete from auth_codes`;
const year = Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "numeric" }).format(new Date()));
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
const plus = (d: number) => new Date(Date.parse(today) + d * 86400000).toISOString().slice(0, 10);
const [cyc] = await sql`insert into review_cycles (year, status, self_start, self_end, first_start, first_end, second_start, second_end, bonus_cutoff)
  values (${year}, 'self_review', ${plus(-3)}, ${plus(1)}, ${plus(2)}, ${plus(6)}, ${plus(7)}, ${plus(10)}, ${plus(1)}) returning id`;
const cycleId = cyc!.id as string;
const [ex] = await sql`insert into cycle_people (cycle_id, email, name, position, hire_date, is_executive, is_target) values (${cycleId}, 'exec@powernet.test', '정임원', '상무', '2010-03-02', true, false) returning id`;
const [ld] = await sql`insert into cycle_people (cycle_id, email, name, department, position, hire_date, is_team_leader, grade_group, form_type, first_reviewer_id)
  values (${cycleId}, 'lead@powernet.test', '최팀장', '영업1팀', '부장', '2015-07-01', true, 1, 'leader', ${ex!.id}) returning id`;
const [ld2] = await sql`insert into cycle_people (cycle_id, email, name, department, position, hire_date, is_team_leader, grade_group, form_type, first_reviewer_id)
  values (${cycleId}, 'lead2@powernet.test', '오팀장', '품질팀', '차장', '2016-01-01', true, 1, 'leader', ${ex!.id}) returning id`;
const ids: Record<string, string> = {};
for (const [email, name, lead] of [["kim@powernet.test", "김대리", ld!.id], ["park@powernet.test", "박과장", ld!.id], ["lee@powernet.test", "이주임", ld!.id], ["yoon@powernet.test", "윤사원", ld2!.id]] as const) {
  const [r] = await sql`insert into cycle_people (cycle_id, email, name, department, position, hire_date, grade_group, form_type, first_reviewer_id, second_reviewer_id)
    values (${cycleId}, ${email}, ${name}, '영업1팀', '대리', '2020-01-01', 5, 'member', ${lead}, ${ex!.id}) returning id`;
  ids[name] = r!.id;
}
for (const n of ["김대리", "이주임"]) {
  const [ev] = await sql`insert into evaluations (person_id, achievement_text, improvement_text, self_submitted_at, version) values (${ids[n]!}, ${`${n} 업적 글`}, '개선 글', now(), 2) returning id`;
  await sql`insert into evaluation_scores (evaluation_id, rater, item_code, score) values (${ev!.id}, 'self', 'responsibility', 6)`;
}

const b = await browser();
const lp = await (await b.newContext({ viewport: { width: 1300, height: 1100 } })).newPage();
await login(lp, "lead@powernet.test");
await lp.goto(`${BASE}/me/review/first/${ids["김대리"]}`);
const inputs = () => lp.locator('input[aria-label$=" 1차 점수"]');
await check("개인작성 기간에도 팀장은 팀원이 제출한 평가지를 볼 수 있지만 점수 칸은 없다", async () =>
  (await lp.getByText("김대리 업적 글").count()) === 1 && (await inputs().count()) === 0 && (await lp.getByText(/1차평가 기간\(.+\)에 입력할 수 있습니다/).count()) === 1,
);

await sql`update review_cycles set status = 'first_review' where id = ${cycleId}`;
await lp.goto(`${BASE}/me`);
const reviewTaskPos = async () => (await lp.locator("li[data-task]").evaluateAll((els) => els.map((e) => e.getAttribute("data-task")))).indexOf("first");
const posBefore = await reviewTaskPos();
await lp.goto(`${BASE}/me/review/first/${ids["김대리"]}`);
await check("1차평가 기간에는 역량 10개와 업적 점수를 1~10으로 넣을 수 있다", async () => (await inputs().count()) === 11);

await inputs().first().fill("11");
await lp.waitForTimeout(2200);
await check("11 같은 범위 밖 숫자는 저장되지 않고 이유가 보인다", async () => {
  const [r] = await sql`select count(*)::int n from evaluation_scores s join evaluations e on e.id = s.evaluation_id where e.person_id = ${ids["김대리"]!} and s.rater = 'first'`;
  return (await lp.getByText("1~10 사이 숫자만 넣을 수 있습니다").count()) >= 1 && r!.n === 0;
});

async function fillAll(v: string) {
  const all = await inputs().all();
  for (const i of all) await i.fill(v);
}
await fillAll("8");
await lp.getByRole("button", { name: "제출" }).click();
await lp.getByRole("link", { name: "다음 사람" }).waitFor();
await lp.getByRole("link", { name: "다음 사람" }).click();
await lp.waitForURL((u) => !u.pathname.endsWith(ids["김대리"]!));
await check("[제출] 뒤 [다음 사람]을 누르면 같은 묶음의 다음 팀원이 열린다", async () => {
  const id = lp.url().split("/").pop();
  return id === ids["박과장"] || id === ids["이주임"];
});
for (let k = 0; k < 2; k++) {
  await inputs().first().waitFor();
  await fillAll("7");
  await lp.getByRole("button", { name: "제출" }).click();
  await lp.getByText("제출함").waitFor();
  const next = lp.getByRole("link", { name: "다음 사람" });
  if (k === 0) {
    await next.click();
    await lp.waitForTimeout(800);
  }
}
await lp.goto(`${BASE}/me`);
await check("다 끝나면 내 할 일에 \"3명 중 3명 완료\"가 보이고 묶음이 아래로 내려간다", async () => {
  const after = await reviewTaskPos();
  return (await lp.getByText("1차 평가 — 3명 중 3명 완료").count()) === 1 && posBefore === 0 && after > posBefore;
});
await lp.screenshot({ path: "/tmp/hr-e2e/07-tasks.png", fullPage: true });

// 임원이 2차 점수를 넣어 둔 상황에서도 팀장 화면에는 2차가 없다
const [kev] = await sql`select id from evaluations where person_id = ${ids["김대리"]!}`;
await sql`insert into evaluation_scores (evaluation_id, rater, item_code, score) values (${kev!.id}, 'second', 'responsibility', 3)`;
await lp.goto(`${BASE}/me/review/first/${ids["김대리"]}`);
await check("팀장 화면 어디에도 2차(임원) 점수 칸이나 숫자가 보이지 않는다", async () => {
  const html = await lp.content();
  const text = await lp.locator("main").innerText();
  return !/2차/.test(text) && !html.includes('"second"') && !/rater.{0,6}second/.test(html);
});
await lp.screenshot({ path: "/tmp/hr-e2e/07-review.png", fullPage: true });

const ep = await (await b.newContext({ viewport: { width: 1300, height: 1100 } })).newPage();
await login(ep, "exec@powernet.test");
await ep.goto(`${BASE}/me/review/second/${ids["김대리"]}`);
await check("같은 시기에 임원이 들어오면 같은 평가지가 보기만 되고 \"2차평가 기간에 입력할 수 있습니다\"가 보인다", async () =>
  (await ep.getByText("김대리 업적 글").count()) === 1 && (await ep.getByText(/2차평가 기간에 입력할 수 있습니다/).count()) === 1 && (await ep.locator("input").count()) === 0,
);

const res = await lp.goto(`${BASE}/me/review/first/${ids["윤사원"]}`);
await check("내 팀원이 아닌 사람의 평가지는 열리지 않는다", async () => res?.status() === 404 && (await lp.getByText("윤사원").count()) === 0);

await b.close();
await sql.end();
process.exit(summary());
