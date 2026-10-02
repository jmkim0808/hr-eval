// PRD 06 확인 문장을 화면에서 점검한다. 가짜 명단.
import { readFileSync } from "node:fs";
import { BASE, LOG, browser, check, login, logSize, sql, summary } from "./helpers";

await sql`delete from email_outbox`;
await sql`delete from cycle_people`;
await sql`delete from review_cycles`;
await sql`delete from auth_codes`;
await sql`insert into app_users (email, name, role) values ('director@powernet.test', '이실장', 'admin') on conflict (email) do nothing`;
const year = Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "numeric" }).format(new Date()));
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
const plus = (d: number) => new Date(Date.parse(today) + d * 86400000).toISOString().slice(0, 10);
const [cyc] = await sql`insert into review_cycles (year, status, self_start, self_end, first_start, first_end, second_start, second_end, bonus_cutoff)
  values (${year}, 'self_review', ${plus(-5)}, ${plus(-1)}, ${plus(0)}, ${plus(4)}, ${plus(5)}, ${plus(9)}, ${plus(-1)}) returning id`;
const cycleId = cyc!.id as string;
const [ex] = await sql`insert into cycle_people (cycle_id, email, name, position, hire_date, is_executive, is_target) values (${cycleId}, 'exec@powernet.test', '정임원', '상무', '2010-03-02', true, false) returning id`;
const [ld] = await sql`insert into cycle_people (cycle_id, email, name, department, position, hire_date, is_team_leader, grade_group, form_type, first_reviewer_id)
  values (${cycleId}, 'lead@powernet.test', '최팀장', '영업1팀', '부장', '2015-07-01', true, 1, 'leader', ${ex!.id}) returning id`;
const ids: Record<string, string> = {};
for (const [email, name] of [["kim@powernet.test", "김대리"], ["lee@powernet.test", "이주임"]] as const) {
  const [r] = await sql`insert into cycle_people (cycle_id, email, name, department, position, hire_date, grade_group, form_type, first_reviewer_id, second_reviewer_id)
    values (${cycleId}, ${email}, ${name}, '영업1팀', '대리', '2020-01-01', 5, 'member', ${ld!.id}, ${ex!.id}) returning id`;
  ids[name] = r!.id;
}
await sql`insert into evaluations (person_id, achievement_text, improvement_text, self_submitted_at, version) values (${ids["김대리"]!}, '업적', '개선', now(), 2)`;
await sql`insert into evaluations (person_id, achievement_text, self_submitted_at, version) values (${ld!.id}, '팀 업적', now(), 2)`;

const b = await browser();
const a1 = await (await b.newContext({ viewport: { width: 1300, height: 1000 } })).newPage();
const a2 = await (await b.newContext({ viewport: { width: 1300, height: 1000 } })).newPage();
await login(a1, "part@powernet.test");
await login(a2, "director@powernet.test");
await a1.goto(`${BASE}/admin`);
await a2.goto(`${BASE}/admin`);

await a1.getByRole("button", { name: "다음 단계로 넘기기" }).click();
await a1.waitForSelector('[role="alertdialog"]');
await check("미제출자가 있으면 확인 창에 이름이 나오고 \"빈칸인 채로 잠깁니다\"가 보인다", async () => {
  const t = await a1.locator('[role="alertdialog"]').innerText();
  return t.includes("빈칸인 채로 잠깁니다") && t.includes("이주임") && !t.includes("김대리");
});
await a1.screenshot({ path: "/tmp/hr-e2e/06-dialog.png" });
await a2.getByRole("button", { name: "다음 단계로 넘기기" }).click();
await a2.waitForSelector('[role="alertdialog"]');

const mark = logSize();
await a1.getByRole("button", { name: "넘기기", exact: true }).click();
await a1.waitForTimeout(1500);
await check("[넘기기]를 누르면 단계 줄의 지금 단계가 다음 칸으로 옮겨진다", async () => (await a1.locator('li[aria-current="step"]').innerText()).includes("1차평가"));
await a2.getByRole("button", { name: "넘기기", exact: true }).click();
await a2.waitForTimeout(1500);
await check("관리자 두 명이 동시에 넘기기를 누르면 한 명만 넘어가고, 다른 한 명에게는 \"다른 관리자가 먼저 처리했습니다\"가 보인다", async () => {
  const [c] = await sql`select status from review_cycles where id = ${cycleId}`;
  return c!.status === "first_review" && (await a2.getByText(/다른 관리자가 먼저 처리했습니다/).count()) === 1;
});
await a1.waitForTimeout(1500);
await check("넘기면 1차 평가자(팀장)에게 1차평가 기간 안내 메일이 간다", async () => {
  const mails = readFileSync(LOG, "utf8").slice(mark).split("[mail:log]").filter((m) => m.includes("1차 평가 기간이 시작되었습니다"));
  return mails.length === 1 && mails[0]!.includes("최팀장 님") && mails[0]!.includes("2명의 평가") && !/점수|등급/.test(mails[0]!);
});

const kim = await (await b.newContext({ viewport: { width: 1300, height: 1000 } })).newPage();
await login(kim, "kim@powernet.test");
await kim.goto(`${BASE}/me/form/${ids["김대리"]}`);
await check("넘긴 뒤 직원이 평가지를 열면 고칠 수 없고 \"개인작성 기간이 끝나 고칠 수 없습니다\"가 보인다", async () =>
  (await kim.locator("#achievement").isDisabled()) && (await kim.getByText("개인작성 기간이 끝나 고칠 수 없습니다").count()) === 1 && (await kim.getByRole("button", { name: "제출" }).count()) === 0,
);
const lee = await (await b.newContext({ viewport: { width: 1300, height: 1000 } })).newPage();
await login(lee, "lee@powernet.test");
await lee.goto(`${BASE}/me`);
await check("미제출로 잠긴 사람은 내 할 일에 \"미제출 (잠김)\"이 보인다", async () => (await lee.getByText("미제출 (잠김)").count()) === 1);

await b.close();
await sql.end();
process.exit(summary());
