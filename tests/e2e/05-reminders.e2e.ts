// PRD 05 확인 문장을 화면에서 점검한다. 가짜 명단.
import { readFileSync } from "node:fs";
import { BASE, LOG, browser, check, login, logSize, sql, summary } from "./helpers";

await sql`delete from email_outbox`;
await sql`delete from cycle_people`;
await sql`delete from review_cycles`;
await sql`delete from auth_codes`;
const year = Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "numeric" }).format(new Date()));
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
const plus = (d: number) => new Date(Date.parse(today) + d * 86400000).toISOString().slice(0, 10);
const [cyc] = await sql`insert into review_cycles (year, status, self_start, self_end, first_start, first_end, second_start, second_end, bonus_cutoff)
  values (${year}, 'self_review', ${plus(-3)}, ${plus(3)}, ${plus(4)}, ${plus(8)}, ${plus(9)}, ${plus(12)}, ${plus(3)}) returning id`;
const cycleId = cyc!.id as string;
const [ex] = await sql`insert into cycle_people (cycle_id, email, name, position, hire_date, is_executive, is_target) values (${cycleId}, 'exec@powernet.test', '정임원', '상무', '2010-03-02', true, false) returning id`;
const [ld] = await sql`insert into cycle_people (cycle_id, email, name, department, position, hire_date, is_team_leader, grade_group, form_type, first_reviewer_id)
  values (${cycleId}, 'lead@powernet.test', '최팀장', '영업1팀', '부장', '2015-07-01', true, 1, 'leader', ${ex!.id}) returning id`;
const ids: Record<string, string> = {};
for (const [email, name] of [["kim@powernet.test", "김대리"], ["park@powernet.test", "박과장"], ["lee@powernet.test", "이주임"]] as const) {
  const [r] = await sql`insert into cycle_people (cycle_id, email, name, department, position, hire_date, grade_group, form_type, first_reviewer_id, second_reviewer_id)
    values (${cycleId}, ${email}, ${name}, '영업1팀', '대리', '2020-01-01', 5, 'member', ${ld!.id}, ${ex!.id}) returning id`;
  ids[name] = r!.id;
}
await sql`insert into evaluations (person_id, achievement_text, version) values (${ids["박과장"]!}, '상반기 신규 거래처 확보', 3)`;

const b = await browser();
const page = await b.newPage({ viewport: { width: 1300, height: 1000 } });
await login(page, "part@powernet.test");
await page.goto(`${BASE}/admin`);
const count = async () => (await page.getByTestId("submitted-count").innerText()).replace(/\s/g, "");
const rowOf = (name: string) => page.locator("tbody tr").filter({ has: page.getByRole("link", { name, exact: true }) });
const before = await count();

// 김대리가 제출
await sql`insert into evaluations (person_id, achievement_text, improvement_text, self_submitted_at, version) values (${ids["김대리"]!}, '업적', '개선', now(), 2)`;
await page.reload();
await check("직원이 제출하면 진행 현황을 다시 열었을 때 제출 숫자가 1 늘고 미제출자 표에서 빠진다", async () =>
  before === "0/4" && (await count()) === "1/4" && (await rowOf("김대리").count()) === 0 && (await rowOf("이주임").count()) === 1,
);
await check("미제출자 표에 작성 전 / 작성 중이 구분되어 보인다", async () =>
  (await rowOf("박과장").getByText("작성 중").count()) === 1 && (await rowOf("이주임").getByText("작성 전").count()) === 1,
);

const mark = logSize();
await rowOf("이주임").getByRole("checkbox").click();
await rowOf("최팀장").getByRole("checkbox").click();
await page.getByRole("button", { name: /독촉 이메일/ }).click();
await page.waitForSelector("text=2명에게 독촉 이메일을 보내고 있습니다");
await page.waitForTimeout(1500);
await page.reload();
const todayLabel = `${Number(today.slice(5, 7))}/${Number(today.slice(8, 10))}`;
await check("몇 명을 골라 [독촉 이메일]을 누르면 그 사람들에게만 메일이 가고 \"마지막 독촉\" 날짜가 오늘로 바뀐다", async () => {
  const mails = readFileSync(LOG, "utf8").slice(mark).split("[mail:log]").filter((m) => m.includes("기한은"));
  const names = mails.map((m) => (m.match(/\n(\S+) 님/) ?? [])[1]).sort();
  const last = async (n: string) => (await rowOf(n).locator("td").last().innerText()).trim();
  return names.join(",") === "이주임,최팀장" && (await last("이주임")) === todayLabel && (await last("최팀장")) === todayLabel && (await last("박과장")) === "—" && !/점수|등급/.test(mails.join(""));
});
await page.screenshot({ path: "/tmp/hr-e2e/05-progress.png", fullPage: true });

await rowOf("박과장").getByRole("link", { name: "박과장" }).click();
await page.waitForURL(/\/admin\/forms\//);
await check("미제출자 이름을 누르면 그 사람이 쓰던 평가지가 고칠 수 없는 상태로 열린다", async () =>
  (await page.inputValue("#achievement")) === "상반기 신규 거래처 확보" &&
  (await page.locator("#achievement").isDisabled()) &&
  (await page.getByRole("button", { name: "제출" }).count()) === 0 &&
  (await page.getByText("관리자는 보기만 할 수 있습니다").count()) === 1,
);

await sql`update review_cycles set self_end = ${plus(-1)} where id = ${cycleId}`;
await page.goto(`${BASE}/admin`);
await check("기간이 지난 단계는 단계 줄에 \"기한 지남\"이 보인다", async () => (await page.locator('li[aria-current="step"]').innerText()).includes("기한 지남"));

await b.close();
await sql.end();
process.exit(summary());
