// 화면 시안 비교용 캡처 (시험 아님). SHOT_DIR에 저장. SHOT_ACCENT=blue면 파랑 색 시안으로 찍는다.
// 실행: SHOT_DIR=... npx tsx tests/demo/ui-shots.e2e.ts
import { mkdirSync } from "node:fs";
import type { Page } from "playwright-core";
import { BASE, browser, E, login, sql } from "../e2e/helpers";

const DIR = process.env.SHOT_DIR ?? "/tmp/hr-ui";
const ACCENT = process.env.SHOT_ACCENT ?? "";
mkdirSync(DIR, { recursive: true });

await sql`delete from email_outbox`;
await sql`delete from cycle_people`;
await sql`delete from review_cycles`;
await sql`delete from auth_codes`;
const year = Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "numeric" }).format(new Date()));
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
const plus = (d: number) => new Date(Date.parse(today) + d * 86400000).toISOString().slice(0, 10);
const [cyc] = await sql`insert into review_cycles (year, status, self_start, self_end, first_start, first_end, second_start, second_end, bonus_cutoff, invited_at)
  values (${year}, 'first_review', ${plus(-8)}, ${plus(-1)}, ${plus(0)}, ${plus(4)}, ${plus(5)}, ${plus(9)}, ${plus(9)}, now()) returning id`;
const cycleId = cyc!.id as string;
let no = 0;
const person = async (v: Record<string, unknown>) => {
  const [r] = await sql`insert into cycle_people ${sql({ cycle_id: cycleId, department: "영업1팀", position: "사원", hire_date: "2021-03-02", employee_no: `U${String(++no).padStart(3, "0")}`, ...v })} returning id`;
  return r!.id as string;
};
const ex = await person({ email: "exec@powernet.test", name: "정임원", position: "상무", department: "", is_executive: true, is_target: false });
const ld = await person({ email: "lead@powernet.test", name: "최팀장", position: "부장", is_team_leader: true, grade_group: 1, form_type: "leader", first_reviewer_id: ex });
const names = ["김민준", "이서연", "박도윤", "정하은", "강지호", "윤서아"];
for (const [i, n] of names.entries()) {
  const id = await person({ email: `u${i}@powernet.test`, name: n, position: i % 2 ? "대리" : "사원", grade_group: 5, form_type: "member", first_reviewer_id: ld, second_reviewer_id: ex });
  if (i < 5) await sql`insert into evaluations (person_id, achievement_text, improvement_text, self_submitted_at, version) values (${id}, ${E("상반기 신규 거래처 3곳 확보, 수주 12억")}, ${E("내년에는 해외 거래처 확대")}, now(), 1)`;
  if (i < 2) await sql`insert into bonus_points (person_id, item, points) values (${id}, 'certificate', ${E(1)})`;
}
await sql`update evaluations set self_submitted_at = now() where person_id = ${ld}`;

const b = await browser();
async function shot(p: Page, name: string, url: string) {
  await p.goto(`${BASE}${url}`);
  await p.waitForLoadState("networkidle");
  if (ACCENT) await p.evaluate((a) => document.documentElement.setAttribute("data-accent", a), ACCENT);
  await p.addStyleTag({ content: '[data-testid="demo-bar"]{display:none!important}' });
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${DIR}/${name}.png` });
}
const ALL = process.env.SHOT_ALL === "1";
const lead = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await login(lead, "lead@powernet.test");
await shot(lead, "1-내할일", "/me");
const [first] = await sql`select id from cycle_people where name = '김민준'`;
await shot(lead, "2-평가하기", `/me/review/first/${first!.id}`);
const adm = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await login(adm, "part@powernet.test");
await shot(adm, "3-진행현황", "/admin");
await shot(adm, "4-가점", "/admin/bonus");
if (ALL) {
  await shot(lead, "5-내평가현황", "/me/review/first");
  await shot(lead, "6-내가점", "/me/bonus");
  await shot(lead, "7-내평가지", `/me/form/${(await sql`select id from cycle_people where name='최팀장'`)[0]!.id}`);
  await shot(adm, "8-전체현황", "/admin/status");
  await shot(adm, "9-평가시작설정", "/admin/setup");
  await shot(adm, "10-평가관리", "/admin/cycles");
  await shot(adm, "11-관리자설정", "/admin/settings");
  await shot(adm, "12-보안열쇠", "/admin/vault");
  await shot(adm, "13-대신입력", `/admin/proxy/${first!.id}`);
  // 최종평가 단계로
  const ITEMS = ["responsibility", "teamwork", "discipline", "objectivity", "execution", "knowledge", "information", "contribution", "communication", "trust", "achievement"];
  const evs = await sql`select e.id, p.name from evaluations e join cycle_people p on p.id = e.person_id where p.form_type = 'member'`;
  for (const [k, e] of evs.entries()) for (const r of ["first", "second"]) for (const c of ITEMS) await sql`insert into evaluation_scores (evaluation_id, rater, item_code, score) values (${e.id}, ${r}, ${c}, ${E(9 - k * 0.5)}) on conflict do nothing`;
  await sql`update review_cycles set status = 'second_review', version = version + 1`;
  await adm.goto(`${BASE}/admin`);
  await adm.getByRole("button", { name: "다음 단계로 넘기기" }).click();
  await adm.getByRole("button", { name: "넘기기", exact: true }).click();
  await adm.waitForTimeout(2000);
  await shot(adm, "14-최종평가", "/admin/final?group=5");
  await sql`insert into app_users (email, name, role) values ('ceo@powernet.test', '대표이사', 'ceo') on conflict (email) do update set role = 'ceo', active = true`;
  const ceo = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await login(ceo, "ceo@powernet.test");
  await shot(ceo, "15-대표이사", "/report?group=5");
  await sql`update review_cycles set status = 'results_sent', confirmed_at = now(), confirmed_by = '김파트장', version = version + 1`;
  await shot(adm, "16-결과발송", "/admin/results");
  const me = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await login(me, "u0@powernet.test");
  await shot(me, "17-내평가결과", "/me/result");
  await shot(me, "18-지난기록", "/me/history");
  const lo = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await shot(lo, "19-로그인", "/login");
  const phone = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await login(phone, "u1@powernet.test");
  await shot(phone, "20-휴대폰-내할일", "/me");
}
await b.close();
await sql.end();
console.log("saved", DIR);
