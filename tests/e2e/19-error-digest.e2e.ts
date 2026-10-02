// PRD 19 확인 문장을 화면에서 점검한다. 오류 화면은 로컬 DB를 잠깐 멈춰서 만든다.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { BASE, LOG, browser, check, login, logSize, sql, summary } from "./helpers";

const PG = `su postgres -s /bin/bash -c "/usr/lib/postgresql/16/bin/pg_ctl -D /var/lib/hr-pg/data -l /var/lib/hr-pg/log -o '-p 5432 -k /tmp' -w`;
const b = await browser();
const page = await b.newPage({ viewport: { width: 1200, height: 800 } });
await sql`delete from auth_codes`;
await login(page, "part@powernet.test");
await page.goto(`${BASE}/admin`);
await sql.end();
execSync(`${PG} stop -m fast"`, { stdio: "ignore" });
await page.goto(`${BASE}/admin/settings`);
const errText = await page.locator("body").innerText();
execSync(`${PG} start"`, { stdio: "ignore" });
await check("오류가 난 화면에는 요청 번호만 보이고 이름·점수 같은 내용은 보이지 않는다", async () =>
  errText.includes("문제가 생겼습니다") && /요청 번호 \S+/.test(errText) && !/김파트장|part@|ECONNREFUSED|postgres|SELECT/i.test(errText),
);

const { default: postgres } = await import("postgres");
const db = postgres(process.env.DATABASE_URL!, { max: 1 });
const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
const tick = async () => (await (await fetch(`${BASE}/api/cron/tick`, { method: "POST", headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })).json()) as { digest: string };
if (hour < 8) console.log("(서울 시각 8시 전이라 요약 메일 확인은 건너뜀)");

await db`delete from audit_logs where action = 'system.error_digest'`;
await db`delete from error_logs`;
await db`delete from email_outbox`;
const yday = new Date(Date.parse(`${today}T15:00:00+09:00`) - 86400_000);
await db`insert into error_logs (where_, message, request_id, created_at) values ('app:/admin', 'boom', 'req-aaa111', ${yday}), ('app:/me', 'boom', 'req-bbb222', ${yday})`;
await db`insert into error_logs (where_, message, request_id, created_at) values ('app:/x', 'later', 'req-today', ${new Date(`${today}T08:30:00+09:00`)})`;
let mark = logSize();
const r1 = await tick();
await new Promise((r) => setTimeout(r, 1500));
const mails = readFileSync(LOG, "utf8").slice(mark).split("[mail:log]").filter((m) => m.includes("오류"));
await check("오류가 있던 다음 날 아침 8시 무렵 관리자 메일함에 \"오류 N건\"과 요청 번호가 온다", async () =>
  hour < 8 || (r1.digest === "queued" && mails.length >= 1 && mails[0]!.includes("오류 2건") && mails[0]!.includes("req-aaa111") && mails[0]!.includes("req-bbb222") && !mails[0]!.includes("req-today")),
);
await check("요약 메일에 이름·이메일·점수가 들어 있지 않다", async () => hour < 8 || !mails.some((m) => /@|김|점수|등급|boom/.test(m.replace(/\[파워넷 인사평가\]|㈜파워넷 인사평가 · 대외비/g, ""))));
const r2 = await tick();
await check("(하루 한 번) 같은 날 다시 불러도 메일이 또 가지 않는다", async () => hour < 8 || r2.digest === "already");

await db`delete from audit_logs where action = 'system.error_digest'`;
await db`delete from error_logs where created_at < ${new Date(`${today}T08:00:00+09:00`)}`;
mark = logSize();
const r3 = await tick();
await new Promise((r) => setTimeout(r, 1000));
await check("오류가 없던 날에는 메일이 오지 않는다", async () => hour < 8 || (r3.digest === "no_errors" && !readFileSync(LOG, "utf8").slice(mark).includes("오류")));

await b.close();
await db.end();
process.exit(summary());
