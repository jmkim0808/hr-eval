// 2026-10-26 보안 열쇠 복구 코드: 만들기·인쇄·다시 입력 확인, 비밀 문구 대신 열기, 쓰면 다시 만들기 안내, 다시 만들면 예전 코드는 못 씀
import { BASE, browser, check, login, sql, summary } from "./helpers";

const ADMIN = "part@powernet.test";
const PASS = process.env.HR_DEV_PASSPHRASE!;
await sql`delete from key_slots where kind = 'recovery'`;

const b = await browser();
const page = await (await b.newContext({ viewport: { width: 1300, height: 1000 } })).newPage();
await login(page, ADMIN);
await page.goto(`${BASE}/admin/vault`);
await check("복구 코드가 없으면 '필수' 표시와 '아직 없습니다 — 평가를 시작할 수 없습니다' 안내가 보인다", async () =>
  (await page.locator('[data-recovery="missing"]').count()) === 1 && (await page.getByTestId("recovery-status").innerText()).includes("평가를 시작(안내 이메일 발송)할 수 없습니다"),
);
await page.getByTestId("recovery-create").click();
const code = (await page.getByTestId("recovery-code").innerText()).trim();
await check("[복구 코드 만들기]를 누르면 5글자×6묶음 코드가 한 번 보인다", async () => /^[0-9A-Z]{5}(-[0-9A-Z]{5}){5}$/.test(code));
await check("확인 전에는 열쇠 칸 목록에 나오지 않고 아직 '준비됨'이 아니다", async () => {
  const [r] = await sql`select confirmed_at from key_slots where kind = 'recovery'`;
  return !!r && r.confirmed_at === null && (await page.locator('tr[data-slot-label="복구 코드"]').count()) === 0;
});
const wrong = code.replace(/^./, (c) => (c === "A" ? "B" : "A"));
await page.fill("#recovery-confirm", wrong);
await page.getByTestId("recovery-confirm-btn").click();
await page.getByTestId("recovery-msg").waitFor();
await check("옮겨 적은 코드가 다르면 '적어 둔 복구 코드와 다릅니다'가 보이고 확정되지 않는다", async () => (await page.getByTestId("recovery-msg").innerText()).includes("다릅니다"));
await page.fill("#recovery-confirm", code.toLowerCase().replace(/-/g, " "));
await page.getByTestId("recovery-confirm-btn").click();
await page.locator('[data-recovery="ready"]').waitFor({ timeout: 15000 });
await check("소문자·띄어쓰기로 다시 넣어도 맞으면 '준비됨'이 되고, 열쇠 칸에 복구 코드가 보이며 지우기 단추는 없다", async () => {
  const row = page.locator('tr[data-slot-label="복구 코드"]');
  return (await page.getByTestId("recovery-status").getAttribute("data-ready")) === "yes" && (await row.count()) === 1 && (await row.getByRole("button", { name: "지우기" }).count()) === 0;
});

// 비밀 문구를 잊었다고 치고 복구 코드로 연다
await page.getByRole("button", { name: "지금 잠그기" }).click();
await page.locator('[data-vault="locked"]').waitFor();
await page.fill("#v-unlock", code.toLowerCase());
await page.getByRole("button", { name: "열기" }).click();
await page.locator('[data-vault="open"]').waitFor({ timeout: 20000 });
await check("잠긴 화면에서 비밀 문구 대신 복구 코드를 넣으면 열리고, 작업 기록에 '복구 코드로 열기'가 남는다", async () => {
  const [r] = await sql`select count(*)::int n from audit_logs where action = 'vault.unlock_recovery' and created_at > now() - interval '2 minutes'`;
  return r!.n >= 1;
});
await check("복구 코드로 열면 '새 비밀 문구를 만들고 복구 코드를 다시 만드세요' 안내가 보이고 '준비됨'이 아니다", async () =>
  (await page.getByTestId("recovery-status").getAttribute("data-ready")) === "no" && (await page.getByTestId("recovery-status").innerText()).includes("복구 코드로 열었습니다"),
);

// 다시 만들면 예전 코드는 못 쓴다
await page.getByTestId("recovery-create").click();
const code2 = (await page.getByTestId("recovery-code").innerText()).trim();
await page.fill("#recovery-confirm", code2);
await page.getByTestId("recovery-confirm-btn").click();
await page.locator('[data-recovery="ready"]').waitFor({ timeout: 15000 });
await page.getByRole("button", { name: "지금 잠그기" }).click();
await page.locator('[data-vault="locked"]').waitFor();
await page.fill("#v-unlock", code);
await page.getByRole("button", { name: "열기" }).click();
await page.waitForSelector("text=비밀 문구(또는 복구 코드)가 맞지 않습니다", { timeout: 20000 }).catch(() => null);
await check("복구 코드를 다시 만들어 확인하면 예전 코드로는 열리지 않는다 (새 코드는 1개만 남음)", async () => {
  const [r] = await sql`select count(*)::int n from key_slots where kind = 'recovery'`;
  return (await page.locator('[data-vault="locked"]').count()) === 1 && r!.n === 1;
});
await page.fill("#v-unlock", PASS);
await page.getByRole("button", { name: "열기" }).click();
await page.locator('[data-vault="open"]').waitFor({ timeout: 20000 });
await check("비밀 문구로는 그대로 열린다", async () => (await page.locator('[data-vault="open"]').count()) === 1);

await b.close();
await sql.end();
process.exit(summary());
