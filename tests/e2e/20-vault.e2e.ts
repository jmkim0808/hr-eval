// ADR-0021 보안 열쇠: 잠그기·열기·열쇠 칸, 잠긴 동안 각 사용자가 보는 화면.
import { readFileSync } from "node:fs";
import { BASE, LOG, browser, check, login, sql, summary } from "./helpers";

const ADMIN = "part@powernet.test";
const PASS = process.env.HR_DEV_PASSPHRASE!;
const SPARE = "예비용-비밀문구-2026!";
await sql`delete from key_slots where label <> '개발용'`; // 복구 코드도 지운다 (27번 시험에서 따로 본다)
const [emp] = await sql`select p.email from cycle_people p join review_cycles c on c.id = p.cycle_id where p.is_target order by c.year desc, p.name limit 1`;
if (!emp) throw new Error("평가 명단이 없습니다 — 02~17 시험을 먼저 돌려 주세요");

const b = await browser();
const ctx = () => b.newContext({ viewport: { width: 1300, height: 900 } }).then((c) => c.newPage());
const admin = await ctx();
await login(admin, ADMIN);
await admin.goto(`${BASE}/admin/vault`);
await check("보안 열쇠 화면에 \"열려 있습니다\"와 열쇠 칸 목록이 보인다", async () =>
  (await admin.locator('[data-vault="open"]').count()) === 1 && (await admin.locator('tr[data-slot-label="개발용"]').count()) === 1,
);
await check("복구 코드가 없으면 \"복구 코드를 만들어 주세요\" 안내가 보이고, 비밀 문구 열쇠 칸이 하나뿐이면 지울 수 없다 (2026-10-26)", async () =>
  (await admin.getByText("위에서 복구 코드를 만들어 주세요").count()) === 1 && (await admin.getByRole("button", { name: "지우기" }).isDisabled()),
);

// 열쇠 칸 추가
await admin.fill("#v-label", "예비");
await admin.fill("#v-new", "짧다");
await admin.fill("#v-new2", "짧다");
await admin.getByRole("button", { name: "열쇠 칸 추가" }).click();
await admin.waitForTimeout(800);
await check("비밀 문구가 12자보다 짧으면 추가되지 않는다 (입력 칸에서 막히거나 안내가 보인다)", async () =>
  (await admin.locator('tr[data-slot-label="예비"]').count()) === 0 &&
  ((await admin.locator("#v-new").evaluate((el: HTMLInputElement) => !el.validity.valid)) || (await admin.getByText("12자 이상이어야").count()) >= 1),
);
await admin.fill("#v-label", "예비");
await admin.fill("#v-new", SPARE);
await admin.fill("#v-new2", SPARE);
await admin.getByRole("button", { name: "열쇠 칸 추가" }).click();
await admin.waitForSelector('tr[data-slot-label="예비"]', { timeout: 15000 }).catch(() => null);
await check("다른 관리자 열쇠 칸을 추가하면 목록에 나온다", async () => (await admin.locator('tr[data-slot-label="예비"]').count()) === 1);

// 잠그기
await admin.getByRole("button", { name: "지금 잠그기" }).click();
await admin.waitForSelector('[data-vault="locked"]', { timeout: 10000 }).catch(() => null);
await check("[지금 잠그기]를 누르면 \"잠겨 있습니다\"가 되고 열쇠 칸 목록은 보이지 않는다", async () =>
  (await admin.locator('[data-vault="locked"]').count()) === 1 && (await admin.locator("tr[data-slot-label]").count()) === 0,
);
await admin.goto(`${BASE}/admin/final`);
await check("잠긴 동안 관리자가 다른 관리자 화면을 열면 보안 열쇠 화면으로 간다", async () => admin.url() === `${BASE}/admin/vault`);

const e = await ctx();
await login(e, emp.email);
await e.goto(`${BASE}/me`);
await check("잠긴 동안 직원이 들어오면 \"잠시 이용할 수 없습니다\" 안내만 보이고 평가 내용은 보이지 않는다", async () =>
  e.url() === `${BASE}/locked` && (await e.getByText("잠시 이용할 수 없습니다").count()) === 1,
);
const ceo = await ctx();
await login(ceo, "ceo@powernet.test");
await ceo.goto(`${BASE}/report`);
await check("잠긴 동안 대표이사도 안내 화면으로 간다", async () => ceo.url() === `${BASE}/locked`);

// 열기
await admin.goto(`${BASE}/admin/vault`);
await admin.fill("#v-unlock", "틀린-비밀문구-입니다");
await admin.getByRole("button", { name: "열기" }).click();
await admin.waitForSelector("text=비밀 문구(또는 복구 코드)가 맞지 않습니다", { timeout: 15000 }).catch(() => null);
await check("비밀 문구가 틀리면 \"비밀 문구가 맞지 않습니다\"가 보이고 작업 기록에 남는다", async () => {
  const [r] = await sql`select count(*)::int n from audit_logs where action = 'vault.unlock_fail' and created_at > now() - interval '2 minutes'`;
  return (await admin.getByText("비밀 문구(또는 복구 코드)가 맞지 않습니다").count()) === 1 && r!.n >= 1;
});
await admin.fill("#v-unlock", SPARE);
await admin.getByRole("button", { name: "열기" }).click();
await admin.waitForSelector('[data-vault="open"]', { timeout: 15000 }).catch(() => null);
await check("추가한 다른 관리자의 비밀 문구로도 열린다", async () => (await admin.locator('[data-vault="open"]').count()) === 1);
await e.goto(`${BASE}/me`);
await check("열리면 직원이 다시 평가 화면을 쓸 수 있다", async () => e.url().startsWith(`${BASE}/me`));

await check("비밀 문구는 작업 기록·서버 기록 어디에도 남지 않는다", async () => {
  const [r] = await sql`select count(*)::int n from audit_logs where detail::text like ${"%" + SPARE.slice(0, 8) + "%"} or detail::text like ${"%" + PASS.slice(0, 8) + "%"}`;
  const log = readFileSync(LOG, "utf8");
  return r!.n === 0 && !log.includes(SPARE) && !log.includes(PASS);
});

// 열쇠 칸 지우기
await admin.locator('tr[data-slot-label="예비"]').getByRole("button", { name: "지우기" }).click();
await admin.waitForTimeout(1500);
await check("열쇠 칸을 지우면 목록에서 사라진다", async () => (await admin.locator('tr[data-slot-label="예비"]').count()) === 0);

await b.close();
await sql.end();
process.exit(summary());
