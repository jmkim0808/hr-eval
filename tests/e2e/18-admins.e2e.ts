// PRD 18 확인 문장을 화면에서 점검한다.
import { BASE, browser, check, login, sql, summary } from "./helpers";

await sql`delete from auth_codes`;
await sql`update app_users set active = false where role = 'admin' and email <> 'part@powernet.test'`;
await sql`delete from app_users where email = 'newadmin@powernet.test'`;

const b = await browser();
const page = await b.newPage({ viewport: { width: 1300, height: 900 } });
await login(page, "part@powernet.test");
await page.goto(`${BASE}/admin/settings`);
const row = (e: string) => page.locator(`tr[data-admin="${e}"]`);
await check("관리자가 1명만 남으면 [해제]가 눌리지 않고 \"마지막 관리자는 해제할 수 없습니다\"가 보인다", async () =>
  (await row("part@powernet.test").getByRole("button", { name: "해제" }).isDisabled()) && (await page.getByText("마지막 관리자는 해제할 수 없습니다").count()) === 1,
);

await page.fill("#admin-email", "not-an-email");
await page.getByRole("button", { name: "관리자 추가" }).click();
await page.waitForTimeout(800);
await check("이메일 형식이 틀리면 \"이메일 주소 형식이 아닙니다\"가 보인다", async () => (await page.getByText("이메일 주소 형식이 아닙니다").count()) === 1);

await page.fill("#admin-email", "NewAdmin@powernet.test");
await page.fill("#admin-name", "박관리");
await page.getByRole("button", { name: "관리자 추가" }).click();
await page.waitForTimeout(1200);
const np = await (await b.newContext({ viewport: { width: 1300, height: 900 } })).newPage();
await login(np, "newadmin@powernet.test");
await np.goto(`${BASE}/`);
await np.waitForTimeout(800);
await check("이메일을 넣고 [관리자 추가]를 누르면 목록에 나타나고, 그 사람이 인증하면 진행 현황이 열린다", async () =>
  (await row("newadmin@powernet.test").getByText("박관리").count()) === 1 && np.url() === `${BASE}/admin` && (await np.getByRole("heading", { name: "진행 현황" }).count()) === 1,
);
await page.screenshot({ path: "/tmp/hr-e2e/18-settings.png", fullPage: true });

await row("newadmin@powernet.test").getByRole("button", { name: "해제" }).click();
await page.waitForTimeout(1200);
await np.goto(`${BASE}/admin/bonus`);
await np.waitForTimeout(800);
await check("해제된 사람은 다음 화면 이동 때 관리자 화면에 들어갈 수 없다", async () => !np.url().includes("/admin") && (await row("newadmin@powernet.test").count()) === 0);
await check("(기록) 추가·해제는 작업 기록에 남는다", async () => {
  const r = await sql`select action from audit_logs where action in ('admin.add','admin.remove') and detail->>'email' = 'newadmin@powernet.test' order by id`;
  return r.map((x) => x.action).join(",") === "admin.add,admin.remove";
});

await sql`update app_users set active = true where email = 'director@powernet.test'`;
await b.close();
await sql.end();
process.exit(summary());
