// PRD 04 확인 문장을 화면에서 점검한다. 가짜 명단.
import { BASE, browser, check, login, sql, summary } from "./helpers";

await sql`delete from email_outbox`;
await sql`delete from cycle_people`;
await sql`delete from review_cycles`;
await sql`delete from auth_codes`;
const year = Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "numeric" }).format(new Date()));
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
const plus = (d: number) => new Date(Date.parse(today) + d * 86400000).toISOString().slice(0, 10);
const [cyc] = await sql`insert into review_cycles (year, status, self_start, self_end, first_start, first_end, second_start, second_end, bonus_cutoff)
  values (${year}, 'self_review', ${plus(-2)}, ${plus(5)}, ${plus(6)}, ${plus(10)}, ${plus(11)}, ${plus(15)}, ${plus(5)}) returning id`;
const cycleId = cyc!.id as string;
const [ex] = await sql`insert into cycle_people (cycle_id, email, name, position, hire_date, is_executive, is_target) values (${cycleId}, 'exec@powernet.test', '정임원', '상무', '2010-03-02', true, false) returning id`;
const [ld] = await sql`insert into cycle_people (cycle_id, email, name, department, position, hire_date, is_team_leader, grade_group, form_type, first_reviewer_id)
  values (${cycleId}, 'lead@powernet.test', '최팀장', '영업1팀', '부장', '2015-07-01', true, 1, 'leader', ${ex!.id}) returning id`;
const [me] = await sql`insert into cycle_people (cycle_id, email, name, department, position, hire_date, grade_group, form_type, first_reviewer_id, second_reviewer_id)
  values (${cycleId}, 'kim@powernet.test', '김대리', '영업1팀', '대리', '2020-01-01', 5, 'member', ${ld!.id}, ${ex!.id}) returning id`;
const end = `${Number(plus(5).slice(5, 7))}/${Number(plus(5).slice(8, 10))}`;

const b = await browser();
const ctx = await b.newContext({ viewport: { width: 1300, height: 1000 } });
const page = await ctx.newPage();

// 안내 메일 링크로 들어오기
await sql`delete from auth_codes where email = 'kim@powernet.test'`;
await page.goto(`${BASE}/login?email=kim%40powernet.test`);
await check("안내 메일 링크로 들어오면 이메일 칸이 채워져 있다", async () => (await page.inputValue('input[name="email"]')) === "kim@powernet.test");
await login(page, "kim@powernet.test");
await page.goto(`${BASE}/`);
await page.waitForURL(`${BASE}/me`);
await check(`인증하면 내 할 일이 열리고 맨 위에 "내 평가지 작성 — 마감 ${end}"가 크게 보인다`, async () =>
  (await page.getByText(`내 평가지 작성 — 마감 ${end}`).count()) === 1 && (await page.getByText("작성 전").count()) === 1,
);

await page.click(`text=내 평가지 작성 — 마감 ${end}`);
await page.waitForURL(/\/me\/form\//);
const formUrl = page.url();
await check("팀원에게는 팀원용 10개 항목(일처리·신뢰성 포함, 리더쉽 없음)이 보인다", async () => {
  const groups = await page.locator('[role="group"]').count();
  const t = await page.locator("main").innerText();
  return groups === 10 && t.includes("팀원용 인사평가지") && t.includes("일처리") && t.includes("신뢰성") && !t.includes("리더쉽");
});
await check("평가자 점수 칸과 가점 칸은 보이지 않고 \"가점은 관리자가 입력합니다\"가 보인다", async () => {
  const t = await page.locator("main").innerText();
  return t.includes("가점은 관리자가 입력합니다") && !/팀장\s*\(60%\)|임원\s*\(40%\)|1차 평가|2차 평가/.test(t);
});

// 업적 빈 채 제출
for (const g of await page.locator('[role="group"]').all()) await g.getByRole("button", { name: "7점" }).click();
await page.fill("#improvement", "내년에는 거래처 관리 체계를 정리하겠습니다.");
await page.getByRole("button", { name: "제출" }).click();
await page.waitForTimeout(1500);
await check("업적 칸이 비었는데 [제출]을 누르면 그 칸이 빨간 테두리로 표시되고 고칠 방법이 보인다", async () =>
  (await page.locator("#achievement").getAttribute("aria-invalid")) === "true" && (await page.getByText(`"${year}년 개인역할 및 업적"을 적어 주세요`).count()) === 1,
);

await page.fill("#achievement", "신규 거래처 3곳을 확보했습니다.");
await page.waitForTimeout(2500);
await check("쓰다가 1~2초 멈추면 \"저장됨 (시각)\"이 보인다", async () => (await page.getByText(/저장됨 \d{2}:\d{2}/).count()) === 1);
await page.close();
const p2 = await ctx.newPage();
await p2.goto(formUrl);
await check("창을 닫았다 다시 열어도 쓰던 내용이 그대로 있다", async () =>
  (await p2.inputValue("#achievement")) === "신규 거래처 3곳을 확보했습니다." && (await p2.locator('[data-pressed]').count()) === 10,
);

await p2.getByRole("button", { name: "제출" }).click();
await p2.waitForURL(`${BASE}/me`);
await check(`제출하면 내 할 일에 "제출 완료 — ${end}까지 고칠 수 있습니다"가 보인다`, async () => (await p2.getByText(`제출 완료 — ${end}까지 고칠 수 있습니다`).count()) === 1);

await p2.goto(formUrl);
await p2.fill("#achievement", "신규 거래처 4곳을 확보했습니다.");
await p2.waitForSelector("text=/저장됨/", { timeout: 8000 });
await p2.waitForTimeout(1600);
await p2.reload();
await check("제출한 뒤 다시 열어 고치고 저장할 수 있다", async () => (await p2.inputValue("#achievement")) === "신규 거래처 4곳을 확보했습니다.");

// 창 두 개
const w1 = p2;
const w2 = await ctx.newPage();
await w2.goto(formUrl);
await w1.fill("#improvement", "창 1에서 고침");
await w1.waitForTimeout(2500);
await w2.fill("#improvement", "창 2에서 고침");
await w2.waitForTimeout(2500);
await check("같은 평가지를 창 두 개로 열어 한쪽에서 고친 뒤 다른 쪽에서 저장하면 \"다른 창에서 고친 내용이 있습니다\"가 보인다", async () =>
  (await w2.getByText("다른 창에서 고친 내용이 있습니다").count()) === 1,
);
await w2.close();

// 기한 지남
await sql`update review_cycles set self_end = ${plus(-1)} where id = ${cycleId}`;
await w1.goto(`${BASE}/me`);
await check("기간이 지나도 계속 쓸 수 있고 \"기한 지남\"이 보인다", async () => {
  const shown = (await w1.getByText("기한 지남").count()) === 1;
  await w1.goto(formUrl);
  await w1.fill("#improvement", "기한 뒤에도 고침");
  await w1.waitForSelector("text=/저장됨/", { timeout: 8000 });
  await w1.waitForTimeout(1600);
  const [r] = await sql`select improvement_text from evaluations where person_id = ${me!.id}`;
  return shown && r!.improvement_text === "기한 뒤에도 고침";
});
await w1.screenshot({ path: "/tmp/hr-e2e/04-form.png", fullPage: true });

await w1.goto(`${BASE}/me/form/${ld!.id}`);
await check("다른 사람의 평가지 주소를 직접 넣어도 열리지 않는다", async () => (await w1.locator("#achievement").count()) === 0 && (await w1.getByText("최팀장").count()) === 0);

// 팀장
const lp = await (await b.newContext({ viewport: { width: 1300, height: 1000 } })).newPage();
await login(lp, "lead@powernet.test");
await lp.goto(`${BASE}/me/form/${ld!.id}`);
await check("팀장에게는 팀장역량(리더쉽·소통·계획)이 들어간 팀장용 항목이 보인다", async () => {
  const t = await lp.locator("main").innerText();
  return (await lp.locator('[role="group"]').count()) === 10 && t.includes("팀장용 인사평가지") && t.includes("리더쉽") && t.includes("계획") && !t.includes("일처리");
});
await lp.goto(`${BASE}/me`);
await lp.screenshot({ path: "/tmp/hr-e2e/04-tasks.png", fullPage: true });

await b.close();
await sql.end();
process.exit(summary());
