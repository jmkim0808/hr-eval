// PRD 03 확인 문장을 화면에서 점검한다. 가짜 명단 25명.
import { readFileSync } from "node:fs";
import { BASE, LOG, browser, check, login, logSize, sql, summary } from "./helpers";

await sql`delete from email_outbox`;
await sql`delete from cycle_people`;
await sql`delete from review_cycles`;
const year = Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "numeric" }).format(new Date()));
const [cyc] = await sql`insert into review_cycles (year) values (${year}) returning id`;
const cycleId = cyc!.id as string;
const [ex] = await sql`insert into cycle_people (cycle_id, email, name, position, hire_date, is_executive, is_target) values (${cycleId}, 'exec@powernet.test', '정임원', '상무', '2010-03-02', true, false) returning id`;
const [ld] = await sql`insert into cycle_people (cycle_id, email, name, department, position, hire_date, is_team_leader, grade_group, form_type, first_reviewer_id)
  values (${cycleId}, 'lead@powernet.test', '최팀장', '영업1팀', '부장', '2015-07-01', true, 1, 'leader', ${ex!.id}) returning id`;
for (let i = 1; i <= 24; i++) {
  await sql`insert into cycle_people (cycle_id, email, name, department, position, hire_date, grade_group, form_type, first_reviewer_id, second_reviewer_id)
    values (${cycleId}, ${`m${i}@powernet.test`}, ${`직원${String(i).padStart(2, "0")}`}, '영업1팀', '대리', '2020-01-01', 5, 'member', ${ld!.id}, ${ex!.id})`;
}

const b = await browser();
const page = await b.newPage({ viewport: { width: 1400, height: 1000 } });
await login(page, "part@powernet.test");
await page.goto(`${BASE}/admin/setup`);
const sendBtn = page.getByRole("button", { name: "안내 이메일 발송" });

await check("명단 또는 기간이 비어 있으면 [안내 이메일 발송]이 눌리지 않는다", async () =>
  (await sendBtn.isDisabled()) && (await page.getByText("기간을 먼저 정해 주세요").count()) === 1,
);

async function fill(v: Record<string, string>) {
  for (const [k, d] of Object.entries(v)) await page.fill(`input[name="${k}"]`, d);
  await page.click('button:has-text("기간 저장")');
  await page.waitForSelector('[role="status"]');
  await page.waitForTimeout(500);
}
const y = String(year);
await fill({ selfStart: `${y}-11-03`, selfEnd: `${y}-11-07`, firstStart: `${y}-11-05`, firstEnd: `${y}-11-14`, secondStart: `${y}-11-17`, secondEnd: `${y}-11-21`, bonusCutoff: `${y}-11-14` });
await check("1차평가 기간이 개인작성 기간보다 앞서면 \"…끝난 뒤로 정해 주세요\" 안내가 보인다", async () => (await page.getByText("1차평가 기간은 개인작성 기간이 끝난 뒤로 정해 주세요").count()) === 1);
await fill({ firstStart: `${y}-11-10` });
await page.waitForSelector("text=기간을 저장했습니다");
await page.reload();
await check("기간을 바르게 저장하면 [안내 이메일 발송]이 눌린다", async () => !(await sendBtn.isDisabled()));

const mark = logSize();
await sendBtn.click();
await page.getByRole("button", { name: "25명에게 발송" }).click();
await page.waitForSelector("text=발송 중", { timeout: 10000 }).catch(() => null);
await check("누르면 \"발송 중 N / 25\"가 보인다", async () => /발송 중\s*\d+ \/ 25/.test((await page.locator("main").innerText())));
await page.goto(`${BASE}/admin`);
const n1 = Number(((await page.locator("main").innerText()).match(/발송 중\s*(\d+) \/ 25/) ?? [])[1] ?? -1);
await page.waitForTimeout(4000);
const n2 = Number(((await page.locator("main").innerText()).match(/(?:발송 중|발송 완료)\s*(\d+)/) ?? [])[1] ?? -1);
await check("화면을 떠났다 와도 숫자가 계속 올라간다", async () => n1 >= 0 && n2 > n1);
await check("진행 현황 단계 줄에서 \"개인작성\"이 지금 단계로 표시된다", async () =>
  (await page.locator('li[aria-current="step"]').innerText()).includes("개인작성"),
);

await page.goto(`${BASE}/admin/setup`);
await page.waitForSelector("text=발송 완료", { timeout: 30000 });
// 두 명을 실패로 만든다 (SMTP 실패 흉내)
await sql`update email_outbox set status = 'failed', last_error = 'test' where to_email in ('m3@powernet.test', 'm7@powernet.test')`;
await page.reload();
await check("끝나면 \"발송 완료 N · 실패 M\"과 실패한 사람 이름이 보인다", async () => {
  const t = await page.locator("main").innerText();
  return /발송 완료\s*23\s*·\s*실패\s*2/.test(t) && t.includes("직원03, 직원07");
});
await page.click('button:has-text("다시 보내기")');
await page.waitForSelector("text=/실패\\s*0/", { timeout: 15000 }).catch(() => null);
await check("[다시 보내기]를 누르면 실패한 사람에게 다시 보낸다", async () => /발송 완료\s*25\s*·\s*실패\s*0/.test(await page.locator("main").innerText()));

const mail = readFileSync(LOG, "utf8").slice(mark);
const one = mail.split("[mail:log]").find((m) => m.includes("직원01 님"))!;
await check("받은 메일에는 개인작성 기간, 가점 인정 기준일, 들어오는 링크가 있고 점수는 없다", async () =>
  one.includes("개인작성 기간 11/3 ~ 11/7") && one.includes("가점 인정 기준일은 11/14") && one.includes("/login?email=m1%40powernet.test") && !/점수|등급/.test(one),
);
await check("발송한 뒤에는 명단을 다시 올릴 수 없다", async () =>
  (await page.getByRole("button", { name: "템플릿 올리기" }).isDisabled()) && (await page.getByText("안내 이메일을 보낸 뒤에는 명단을 다시 올릴 수 없습니다").count()) === 1,
);
await page.screenshot({ path: "/tmp/hr-e2e/03-setup.png", fullPage: true });
await page.goto(`${BASE}/admin`);
await page.screenshot({ path: "/tmp/hr-e2e/03-progress.png", fullPage: true });

await b.close();
await sql.end();
process.exit(summary());
