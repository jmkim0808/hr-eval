// 2026-10-26: 메일 발송 설정 화면 + 관리자이면서 피평가자인 경우 (본인 기록 수정은 허용, 작업 기록·백업에 따로 표시)
import ExcelJS from "exceljs";
import { BASE, browser, check, employeeNoOf, login, sql, summary } from "./helpers";

await sql`delete from email_outbox`;
await sql`delete from cycle_people`;
await sql`delete from review_cycles`;
await sql`delete from auth_codes`;
await sql`delete from mail_settings`;
const ADMIN = "part@powernet.test";
const adminNo = await employeeNoOf(ADMIN);
const year = Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "numeric" }).format(new Date()));
const [cyc] = await sql`insert into review_cycles (year, status, self_start, self_end, first_start, first_end, second_start, second_end, bonus_cutoff)
  values (${year}, 'self_review', '2026-10-20', '2026-11-07', '2026-11-10', '2026-11-14', '2026-11-17', '2026-11-21', '2026-11-14') returning id`;
const cycleId = cyc!.id as string;
const person = async (v: Record<string, unknown>) => {
  const [r] = await sql`insert into cycle_people ${sql({ cycle_id: cycleId, department: "경영지원실", position: "대리", hire_date: "2020-01-01", ...v })} returning id`;
  return r!.id as string;
};
const ex = await person({ email: "exec@powernet.test", name: "정임원", position: "상무", department: "", is_executive: true, is_target: false });
const ld = await person({ email: "lead@powernet.test", name: "최팀장", position: "부장", is_team_leader: true, grade_group: 1, form_type: "leader", second_reviewer_id: ex });
const me = await person({ email: ADMIN, employee_no: adminNo, name: "박파트", position: "차장", grade_group: 3, form_type: "member", first_reviewer_id: ld, second_reviewer_id: ex });
await person({ email: "kim@powernet.test", name: "김대리", grade_group: 5, form_type: "member", first_reviewer_id: ld, second_reviewer_id: ex });

const b = await browser();
const page = await b.newPage({ viewport: { width: 1400, height: 1000 }, acceptDownloads: true });
await login(page, ADMIN);

// ── 관리자이면서 피평가자 ──
await page.goto(`${BASE}/me`);
await check("[관리자=피평가자] 관리자도 명단에 있으면 내 할 일에 '내 평가지 작성'이 보인다", async () => (await page.locator('li[data-task="self"]').count()) === 1);
await page.goto(`${BASE}/admin/bonus`);
async function setEducation(name: string, v: string) {
  await page.locator(`tr[data-person="${name}"]`).click();
  await page.waitForSelector('[role="dialog"]');
  await page.fill("#b-education", v);
  await page.getByRole("button", { name: "저장" }).click();
  await page.waitForTimeout(1500);
}
await setEducation("박파트", "0.5");
await setEducation("김대리", "0.5");
await check("[관리자=피평가자] 본인 가점도 넣을 수 있고, 작업 기록에 '본인 기록'으로 따로 남는다 (남의 것은 표시 없음)", async () => {
  const rows = await sql`select person_id, detail from audit_logs where action = 'bonus.set' and cycle_id = ${cycleId} order by created_at desc limit 2`;
  const mine = rows.find((r) => r.person_id === me);
  const other = rows.find((r) => r.person_id !== me);
  return mine?.detail?.selfRecord === true && !!other && other.detail?.selfRecord === undefined;
});
const dl = page.waitForEvent("download");
await page.goto(`${BASE}/admin`);
await page.locator("main").getByRole("button", { name: "전체 기록 백업 내려받기" }).last().click();
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile((await (await dl).path())!);
await check("[관리자=피평가자] 전체 백업 엑셀에 '관리자 본인 기록 수정' 시트가 있고 가점 입력 1줄이 보인다", async () => {
  const ws = wb.getWorksheet("관리자 본인 기록 수정");
  if (!ws) return false;
  const rows: string[][] = [];
  ws.eachRow((r, i) => i > 1 && rows.push((r.values as unknown[]).slice(1).map(String)));
  return rows.length === 1 && rows[0]![1] === ADMIN && rows[0]![2] === "가점 입력";
});

// ── 메일 발송 설정 ──
await page.goto(`${BASE}/admin/mail`);
await check("[메일] 관리자 메뉴에 '메일 발송'이 있고, 설정이 없으면 '없음' 또는 '서버 기본 설정'이 보인다", async () =>
  (await page.getByRole("link", { name: "메일 발송" }).count()) >= 1 && /없음|서버 기본 설정/.test(await page.getByTestId("mail-using").innerText()),
);
await page.fill("#mail-from-address", "hr-eval@powernet.test");
await page.fill("#mail-host", "smtp.powernet.test");
await page.fill("#mail-port", "70000");
await page.fill("#mail-user", "hr-eval@powernet.test");
await page.fill("#mail-pass", "Secret-Pass-123");
await page.getByTestId("mail-save").click();
await page.getByTestId("mail-status").waitFor();
await check("[메일] 포트가 틀리면 저장하지 않고 이유가 보이며, 넣은 값은 남는다(비밀번호 제외)", async () =>
  (await page.getByTestId("mail-status").innerText()).includes("포트") && (await page.inputValue("#mail-host")) === "smtp.powernet.test" && (await page.inputValue("#mail-pass")) === "" && (await sql`select 1 from mail_settings`).length === 0,
);
await page.fill("#mail-port", "465");
await page.fill("#mail-pass", "Secret-Pass-123");
await page.getByTestId("mail-save").click();
await page.waitForFunction(() => document.querySelector('[data-testid="mail-status"]')?.textContent?.includes("저장했습니다"));
await page.reload();
await check("[메일] 저장하면 '이 화면 설정'으로 보이고, 비밀번호는 화면에 없고 DB에는 암호화돼 있다", async () => {
  const [r] = await sql`select password, host, port from mail_settings`;
  const html = await page.content();
  return (await page.getByTestId("mail-using").innerText()) === "이 화면 설정" && !html.includes("Secret-Pass-123") && String(r?.password).startsWith("s1:") && !String(r?.password).includes("Secret") && r?.port === 465;
});
await page.fill("#mail-from-name", "인사팀");
await page.getByTestId("mail-save").click();
await page.waitForFunction(() => document.querySelector('[data-testid="mail-status"]')?.textContent?.includes("저장했습니다"));
await check("[메일] 비밀번호를 비워 두고 저장하면 저장된 비밀번호를 그대로 쓰고, 작업 기록에 서버 주소만 남는다", async () => {
  const [r] = await sql`select from_name, password from mail_settings`;
  const logs = await sql`select detail from audit_logs where action = 'mail.settings.save' order by created_at desc`;
  return r?.from_name === "인사팀" && String(r.password).startsWith("s1:") && logs.length === 2 && !JSON.stringify(logs).includes("Secret") && logs[0]!.detail.host === "smtp.powernet.test";
});
await page.getByTestId("mail-clear").click();
await page.waitForTimeout(1500);
await check("[메일] 화면 설정을 지우면 서버 기본 설정(또는 없음)으로 돌아간다", async () => (await sql`select 1 from mail_settings`).length === 0 && !/이 화면 설정/.test(await page.getByTestId("mail-using").innerText()));

await b.close();
await sql.end();
process.exit(summary());
