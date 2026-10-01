// PRD 01 확인 문장을 화면에서 점검한다.
import { BASE, browser, check, codeSince, login, logSize, sql, summary } from "./helpers";

const ADMIN = "part@powernet.test";
const b = await browser();
const page = await b.newPage();

await sql`delete from sessions`;
await sql`delete from auth_codes`;

// 1~2. 인증번호 메일 → 진행 현황
await page.goto(`${BASE}/login`);
let mark = logSize();
await page.fill('input[name="email"]', ADMIN);
await page.click('button:has-text("인증번호 받기")');
await page.waitForSelector('input[name="code"]');
const code = await codeSince(mark);
await check("관리자 이메일을 넣으면 인증번호 메일이 온다", async () => !!code);
await check("[다시 보내기]는 60초가 지나야 눌린다", async () => {
  const btn = page.locator('button:has-text("다시 보내기")');
  return (await btn.isDisabled()) && /초 뒤/.test((await btn.textContent()) ?? "");
});
await page.fill('input[name="code"]', "000000" === code ? "111111" : "000000");
await page.click('button:has-text("인증하기")');
await check("틀린 번호를 넣으면 \"번호가 맞지 않습니다\"가 보인다", async () => {
  await page.waitForSelector("text=번호가 맞지 않습니다");
  return true;
});
await page.fill('input[name="code"]', code!);
await page.click('button:has-text("인증하기")');
await page.waitForURL(`${BASE}/admin`);
await check("인증번호를 넣으면 진행 현황이 열리고 \"아직 시작한 평가가 없습니다\"가 보인다", async () =>
  (await page.locator("text=아직 시작한 평가가 없습니다").count()) === 1 && (await page.locator('a:has-text("평가 시작 설정")').count()) >= 1,
);
await check("오른쪽 위에 \"대외비 · 열람자 (내 이름)\"이 보인다", async () => (await page.getByText("대외비 · 열람자 김파트장").count()) === 1);

// 30분 미사용
await sql`update sessions set last_seen_at = now() - interval '31 minutes'`;
await page.goto(`${BASE}/admin`);
await check("30분 동안 아무것도 하지 않고 다시 누르면 이메일 인증 화면으로 간다", async () =>
  page.url().includes("/login") && (await page.locator("text=30분 동안 사용하지 않아").count()) === 1,
);

// 10분 지남
await sql`delete from auth_codes`;
const p2 = await b.newPage();
await p2.goto(`${BASE}/login`);
mark = logSize();
await p2.fill('input[name="email"]', ADMIN);
await p2.click('button:has-text("인증번호 받기")');
await p2.waitForSelector('input[name="code"]');
const code2 = await codeSince(mark);
await sql`update auth_codes set expires_at = now() - interval '1 minute'`;
await p2.fill('input[name="code"]', code2!);
await p2.click('button:has-text("인증하기")');
await check("10분이 지나면 \"시간이 지났습니다\"가 보인다", async () => {
  await p2.waitForSelector("text=시간이 지났습니다");
  return true;
});

// 5번 틀림
await sql`delete from auth_codes`;
const p3 = await b.newPage();
await p3.goto(`${BASE}/login`);
mark = logSize();
await p3.fill('input[name="email"]', ADMIN);
await p3.click('button:has-text("인증번호 받기")');
await p3.waitForSelector('input[name="code"]');
const code3 = await codeSince(mark);
const wrong = code3 === "123456" ? "654321" : "123456";
for (let i = 0; i < 5; i++) {
  await p3.fill('input[name="code"]', wrong);
  await p3.click('button:has-text("인증하기")');
  await p3.waitForTimeout(400);
}
await p3.fill('input[name="code"]', code3!);
await p3.click('button:has-text("인증하기")');
await check("5번 틀리면 그 번호로는 들어갈 수 없고 다시 받아야 한다", async () => {
  await p3.waitForSelector("text=다시 받아 주세요");
  return p3.url().includes("/login");
});

// 명단에 없는 이메일
await sql`delete from auth_codes`;
const p4 = await b.newPage();
await p4.goto(`${BASE}/login`);
mark = logSize();
await p4.fill('input[name="email"]', "nobody@powernet.test");
await p4.click('button:has-text("인증번호 받기")');
await p4.waitForSelector("text=인증번호를 보냈습니다");
await check("명단에 없는 이메일도 화면에는 똑같이 \"보냈습니다\"가 보이고, 메일은 오지 않는다", async () => (await codeSince(mark)) === null);

// 정상 로그인 재확인 + 화면 캡처
const p5 = await b.newPage({ viewport: { width: 1280, height: 720 } });
await login(p5, ADMIN);
await p5.screenshot({ path: process.env.SHOT_DIR ? `${process.env.SHOT_DIR}/01-admin.png` : "/tmp/01-admin.png" });

await b.close();
await sql.end();
process.exit(summary());
