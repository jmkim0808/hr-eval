// PRD 08 확인 문장을 화면에서 점검한다. 가짜 명단.
import { BASE, browser, check, login, sql, summary } from "./helpers";

await sql`delete from email_outbox`;
await sql`delete from cycle_people`;
await sql`delete from review_cycles`;
await sql`delete from auth_codes`;
const year = Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "numeric" }).format(new Date()));
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
const plus = (d: number) => new Date(Date.parse(today) + d * 86400000).toISOString().slice(0, 10);
const [cyc] = await sql`insert into review_cycles (year, status, self_start, self_end, first_start, first_end, second_start, second_end, bonus_cutoff)
  values (${year}, 'first_review', ${plus(-8)}, ${plus(-5)}, ${plus(-4)}, ${plus(1)}, ${plus(2)}, ${plus(6)}, ${plus(-5)}) returning id`;
const cycleId = cyc!.id as string;
const person = async (v: Record<string, unknown>) => {
  const [r] = await sql`insert into cycle_people ${sql({ cycle_id: cycleId, department: "영업1팀", position: "대리", hire_date: "2020-01-01", ...v })} returning id`;
  return r!.id as string;
};
const ex = await person({ email: "exec@powernet.test", name: "정임원", position: "상무", department: "", is_executive: true, is_target: false });
const ex2 = await person({ email: "exec2@powernet.test", name: "한전무", position: "전무", department: "", is_executive: true, is_target: false });
const ld = await person({ email: "lead@powernet.test", name: "최팀장", position: "부장", is_team_leader: true, grade_group: 1, form_type: "leader", first_reviewer_id: ex });
const ld2 = await person({ email: "lead2@powernet.test", name: "오팀장", department: "품질팀", position: "차장", is_team_leader: true, grade_group: 1, form_type: "leader", first_reviewer_id: ex });
const kim = await person({ email: "kim@powernet.test", name: "김대리", grade_group: 5, form_type: "member", first_reviewer_id: ld, second_reviewer_id: ex });
const park = await person({ email: "park@powernet.test", name: "박과장", grade_group: 4, form_type: "member", first_reviewer_id: ld, second_reviewer_id: ex });
const yoon = await person({ email: "yoon@powernet.test", name: "윤사원", department: "품질팀", grade_group: 5, form_type: "member", first_reviewer_id: ld2, second_reviewer_id: ex2 });
void yoon;
const [kev] = await sql`insert into evaluations (person_id, achievement_text, improvement_text, self_submitted_at, first_submitted_at, version) values (${kim}, '김대리 업적 글', '개선', now(), now(), 3) returning id`;
const codes = ["responsibility", "teamwork", "discipline", "objectivity", "execution", "knowledge", "information", "contribution", "communication", "trust", "achievement"];
for (const c of codes) await sql`insert into evaluation_scores (evaluation_id, rater, item_code, score) values (${kev!.id}, 'first', ${c}, 9)`;
await sql`insert into evaluations (person_id, achievement_text, self_submitted_at, version) values (${ld}, '최팀장 팀 업적', now(), 2)`;

const b = await browser();
const ep = await (await b.newContext({ viewport: { width: 1300, height: 1100 } })).newPage();
await login(ep, "exec@powernet.test");
const inputs = (col: string) => ep.locator(`input[aria-label$=" ${col} 점수"]`);

await ep.goto(`${BASE}/me/review/second/${kim}`);
const viewOnly1 = (await ep.locator("input").count()) === 0 && (await ep.getByText("김대리 업적 글").count()) === 1;
await ep.goto(`${BASE}/me/review/leader/${ld}`);
const viewOnly2 = (await ep.locator("input").count()) === 0 && (await ep.getByText("최팀장 팀 업적").count()) === 1;
await check("1차평가 기간에는 같은 화면이 보기만 된다", async () => viewOnly1 && viewOnly2);

await sql`update review_cycles set status = 'second_review' where id = ${cycleId}`;
const ap = await (await b.newContext({ viewport: { width: 1300, height: 1000 } })).newPage();
await login(ap, "part@powernet.test");
await ap.goto(`${BASE}/admin`);
await check("(진행 현황) 2차평가 단계에는 남은 평가가 있는 임원이 미제출자로 보인다", async () =>
  (await ap.getByText("임원 (2차 평가 4명 중 4명 남음)").count()) === 1 && (await ap.getByText("한전무").count()) === 1,
);

await ep.goto(`${BASE}/me`);
await check("임원의 내 할 일에 \"2차 평가\" 묶음과 \"팀장 평가\" 묶음이 보인다", async () =>
  (await ep.getByText("2차 평가 — 2명 중 2명 남음").count()) === 1 && (await ep.getByText("팀장 평가 — 팀장 2명 중 2명 남음").count()) === 1,
);

await ep.goto(`${BASE}/me/review/second/${kim}`);
await check("2차평가 기간에 임원이 열면 1차(팀장) 점수가 옆 칸에 보이고 2차 칸에 입력할 수 있다", async () => {
  const header = await ep.locator("main").innerText();
  return header.includes("1차") && (await ep.locator("main").getByText("9", { exact: true }).count()) >= 10 && (await inputs("2차").count()) === 11;
});
await ep.screenshot({ path: "/tmp/hr-e2e/08-second.png", fullPage: true });

async function fillSubmit(col: string, v: string) {
  for (const i of await inputs(col).all()) await i.fill(v);
  await ep.getByRole("button", { name: "제출" }).click();
  await ep.getByText("제출함").waitFor();
}
await fillSubmit("2차", "7");
await ep.goto(`${BASE}/me/review/second/${park}`);
await fillSubmit("2차", "6");

await ep.goto(`${BASE}/me/review/leader/${ld}`);
await check("팀장 평가 묶음에 담당 팀장들이 보이고, 팀장용 항목(리더쉽·소통·계획 포함)에 점수를 넣을 수 있다", async () => {
  const t = await ep.locator("main").innerText();
  return t.includes("최팀장") && t.includes("오팀장") && t.includes("리더쉽") && t.includes("계획") && (await inputs("임원").count()) === 11;
});
await fillSubmit("임원", "8");
await ep.goto(`${BASE}/me/review/leader/${ld2}`);
await fillSubmit("임원", "8");

const res = await ep.goto(`${BASE}/me/review/second/${yoon}`);
await check("내가 맡지 않은 사람의 평가지는 열리지 않는다", async () => res?.status() === 404);

await ep.goto(`${BASE}/me`);
await check("다 끝나면 묶음마다 \"N명 중 N명 완료\"가 보인다", async () =>
  (await ep.getByText("2차 평가 — 2명 중 2명 완료").count()) === 1 && (await ep.getByText("팀장 평가 — 2명 중 2명 완료").count()) === 1,
);
await check("(저장) 팀장 평가는 1차 칸, 팀원 2차는 2차 칸에 저장된다", async () => {
  const r = await sql`select e.person_id, s.rater, count(*)::int n from evaluation_scores s join evaluations e on e.id = s.evaluation_id where s.rater in ('first','second') group by 1, 2`;
  const n = (p: string, rater: string) => r.find((x) => x.person_id === p && x.rater === rater)?.n ?? 0;
  return n(ld, "first") === 11 && n(ld2, "first") === 11 && n(kim, "second") === 11 && n(kim, "first") === 11 && n(ld, "second") === 0;
});
await ep.screenshot({ path: "/tmp/hr-e2e/08-tasks.png", fullPage: true });

await b.close();
await sql.end();
process.exit(summary());
