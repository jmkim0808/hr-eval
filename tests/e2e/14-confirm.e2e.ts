// PRD 14 확인 문장을 화면에서 점검한다. 가짜 명단.
import { BASE, browser, check, login, sql, summary } from "./helpers";

await sql`delete from email_outbox`;
await sql`delete from cycle_people`;
await sql`delete from review_cycles`;
await sql`delete from auth_codes`;
await sql`insert into app_users (email, name, role) values ('director@powernet.test', '이실장', 'admin') on conflict (email) do update set role = 'admin', active = true`;
const year = Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "numeric" }).format(new Date()));
const [cyc] = await sql`insert into review_cycles (year, status, self_start, self_end, first_start, first_end, second_start, second_end, bonus_cutoff)
  values (${year}, 'second_review', '2026-09-01', '2026-09-05', '2026-09-08', '2026-09-12', '2026-09-15', '2026-09-19', '2026-09-05') returning id`;
const cycleId = cyc!.id as string;
const person = async (v: Record<string, unknown>) => {
  const [r] = await sql`insert into cycle_people ${sql({ cycle_id: cycleId, department: "영업1팀", position: "대리", hire_date: "2020-01-01", ...v })} returning id`;
  return r!.id as string;
};
const MEMBER = ["responsibility", "teamwork", "discipline", "objectivity", "execution", "knowledge", "information", "contribution", "communication", "trust", "achievement"];
const LEADER = ["responsibility", "teamwork", "discipline", "objectivity", "knowledge", "information", "contribution", "leadership", "communication", "planning", "achievement"];
async function scores(personId: string, rater: "first" | "second", v: number, codes = MEMBER) {
  const [ev] = await sql`insert into evaluations (person_id, version) values (${personId}, 1) on conflict (person_id) do update set version = evaluations.version returning id`;
  for (const c of codes) await sql`insert into evaluation_scores (evaluation_id, rater, item_code, score) values (${ev!.id}, ${rater}, ${c}, ${v})`;
}
const ex = await person({ email: "exec@powernet.test", name: "정임원", position: "상무", department: "", is_executive: true, is_target: false });
const ld = await person({ email: "lead@powernet.test", name: "최팀장", position: "부장", is_team_leader: true, grade_group: 1, form_type: "leader", first_reviewer_id: ex });
await scores(ld, "first", 8, LEADER);
for (const [name, f, s] of [["일번", 9, 9], ["이번", 8, 8], ["삼번", 7, 7]] as const) {
  const id = await person({ email: `${name}@powernet.test`, name, grade_group: 5, form_type: "member", first_reviewer_id: ld, second_reviewer_id: ex });
  await scores(id, "first", f);
  await scores(id, "second", s);
  await sql`insert into bonus_points (person_id, item, points) values (${id}, 'certificate', 0)`;
}
const blank = await person({ email: "blank@powernet.test", name: "빈칸이", grade_group: 5, form_type: "member", first_reviewer_id: ld, second_reviewer_id: ex });
await scores(blank, "first", 7);

const b = await browser();
const page = await b.newPage({ viewport: { width: 1400, height: 1000 } });
await login(page, "part@powernet.test");
await page.goto(`${BASE}/admin`);
await page.getByRole("button", { name: "다음 단계로 넘기기" }).click();
await page.getByRole("button", { name: "넘기기", exact: true }).click();
await page.waitForTimeout(1500);
await page.goto(`${BASE}/admin/final?group=5`);
const confirmBtn = page.getByRole("button", { name: "확정", exact: true });
await check("점수 빈칸이 있으면 [확정]이 눌리지 않고 이유가 보인다", async () => (await confirmBtn.isDisabled()) && (await page.getByText("점수 빈칸 1명을 대신 입력해야 확정할 수 있습니다").count()) === 1);

// 빈칸 대신 입력
await page.goto(`${BASE}/admin/final/fill/${blank}`);
for (const i of await page.locator('input[aria-label$="(빈칸)"]').all()) await i.fill("7");
await page.getByRole("button", { name: "대신 입력 저장" }).click();
await page.waitForURL(`${BASE}/admin/final`);
await page.goto(`${BASE}/admin/final?group=5`);
await confirmBtn.click();
await page.waitForSelector('[role="alertdialog"]');
const warn = await page.locator('[role="alertdialog"]').innerText();
await page.locator('[role="alertdialog"]').getByRole("button", { name: "확정", exact: true }).click();
await page.waitForTimeout(1500);
const md = (() => {
  const t = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
  return `${Number(t.slice(5, 7))}/${Number(t.slice(8, 10))}`;
})();
await check("확정하면 \"확정됨 (날짜, 확정자)\"가 보이고 등급 칸을 누를 수 없다", async () =>
  warn.includes("가점 미반영 2명") && (await page.getByText(`확정됨 (${md}, 확정자 김파트장)`).count()) === 1 && (await page.getByRole("combobox").count()) === 0,
);
await page.goto(`${BASE}/admin/bonus`);
const bonusLocked = async () =>
  (await page.getByText("평가등급이 확정되어 가점을 더 이상 인정하지 않습니다").count()) === 1 &&
  (await page.getByRole("button", { name: "템플릿 올리기" }).isDisabled()) &&
  (await page.getByRole("button", { name: "입력" }).count()) === 0;
await check("확정 뒤 가점 입력 화면이 보기 전용이 되고 \"평가등급이 확정되어 가점을 더 이상 인정하지 않습니다\"가 보인다", bonusLocked);

await page.goto(`${BASE}/admin/final?group=5`);
await page.getByRole("button", { name: "확정 취소" }).click();
await page.waitForSelector('[role="alertdialog"]');
const dlg = page.locator('[role="alertdialog"]');
const disabledBefore = await dlg.getByRole("button", { name: "확정 취소" }).isDisabled();
await page.fill("#cancel-reason", "대표이사 보고 뒤 조정 의견 반영");
await dlg.getByRole("button", { name: "확정 취소" }).click();
await page.waitForTimeout(2500);
await check("[확정 취소]는 사유를 적어야 눌리고, 누르면 다른 관리자에게 메일이 간다", async () => {
  const mails = await sql`select to_email, status, payload from email_outbox where kind = 'admin_alert'`;
  return disabledBefore && mails.length === 1 && mails[0]!.to_email === "director@powernet.test" && (await page.getByRole("button", { name: "확정", exact: true }).count()) === 1;
});
await page.goto(`${BASE}/admin/bonus`);
await check("확정을 취소해도 가점 입력은 열리지 않는다", bonusLocked);

await sql`update review_cycles set status = 'results_sent', confirmed_at = now(), confirmed_by = '김파트장' where id = ${cycleId}`;
await page.goto(`${BASE}/admin/final?group=5`);
await check("결과 알림을 보낸 뒤에는 [확정 취소]가 보이지 않는다", async () => (await page.getByRole("button", { name: "확정 취소" }).count()) === 0 && (await page.getByText(/확정됨 \(/).count()) === 1);

await b.close();
await sql.end();
process.exit(summary());
