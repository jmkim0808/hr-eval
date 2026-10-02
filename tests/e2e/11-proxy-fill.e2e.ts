// PRD 11 확인 문장을 화면에서 점검한다. 가짜 명단.
import { BASE, browser, check, login, sql, summary } from "./helpers";

await sql`delete from email_outbox`;
await sql`delete from cycle_people`;
await sql`delete from review_cycles`;
await sql`delete from auth_codes`;
const year = Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "numeric" }).format(new Date()));
const [cyc] = await sql`insert into review_cycles (year, status, self_start, self_end, first_start, first_end, second_start, second_end, bonus_cutoff)
  values (${year}, 'second_review', '2026-09-01', '2026-09-05', '2026-09-08', '2026-09-12', '2026-09-15', '2026-09-19', '2026-09-05') returning id`;
const cycleId = cyc!.id as string;
const person = async (v: Record<string, unknown>) => {
  const [r] = await sql`insert into cycle_people ${sql({ cycle_id: cycleId, department: "영업1팀", position: "대리", hire_date: "2020-01-01", ...v })} returning id`;
  return r!.id as string;
};
const ITEMS = ["responsibility", "teamwork", "discipline", "objectivity", "execution", "knowledge", "information", "contribution", "communication", "trust", "achievement"];
async function scores(personId: string, rater: "first" | "second", v: number, only?: string[]) {
  const [ev] = await sql`insert into evaluations (person_id, version) values (${personId}, 1) on conflict (person_id) do update set version = evaluations.version returning id`;
  for (const c of only ?? ITEMS) await sql`insert into evaluation_scores (evaluation_id, rater, item_code, score) values (${ev!.id}, ${rater}, ${c}, ${v})`;
}
const ex = await person({ email: "exec@powernet.test", name: "정임원", position: "상무", department: "", is_executive: true, is_target: false });
const ld = await person({ email: "lead@powernet.test", name: "최팀장", position: "부장", is_team_leader: true, grade_group: 1, form_type: "leader", first_reviewer_id: ex });
await scores(ld, "first", 8, ["responsibility", "teamwork", "discipline", "objectivity", "knowledge", "information", "contribution", "leadership", "communication", "planning", "achievement"]);
const ids: Record<string, string> = {};
for (const [name, f, s] of [["일번", 8, 8], ["이번", 8, 7], ["삼번", 7, 7], ["사번", 6, 7], ["오번", 6, 6]] as const) {
  ids[name] = await person({ email: `${name}@powernet.test`, name, grade_group: 5, form_type: "member", first_reviewer_id: ld, second_reviewer_id: ex });
  await scores(ids[name]!, "first", f);
  await scores(ids[name]!, "second", s);
}
const blank = await person({ email: "blank@powernet.test", name: "빈칸이", grade_group: 5, form_type: "member", first_reviewer_id: ld, second_reviewer_id: ex });
await scores(blank, "first", 7);
await scores(blank, "second", 6, ["responsibility", "teamwork", "discipline"]);

const b = await browser();
const page = await b.newPage({ viewport: { width: 1400, height: 1000 } });
await login(page, "part@powernet.test");
await page.goto(`${BASE}/admin`);
await page.getByRole("button", { name: "다음 단계로 넘기기" }).click();
await page.getByRole("button", { name: "넘기기", exact: true }).click();
await page.waitForTimeout(1500);
await page.goto(`${BASE}/admin/final?group=5`);
const row = (n: string) => page.locator(`tr[data-person="${n}"]`);
const gradeOf = async (n: string) => (await row(n).locator("td").nth(8).innerText()).trim();
const before = await gradeOf("일번");

await row("빈칸이").getByText("점수 빈칸 — 대신 입력 필요").click();
await page.waitForURL(/\/admin\/final\/fill\//);
const blanksInputs = page.locator('input[aria-label$="(빈칸)"]');
await check("빈 칸에만 입력할 수 있고 이미 들어간 점수는 고칠 수 없다", async () =>
  (await blanksInputs.count()) === 8 &&
  (await page.locator('input[aria-label="책임감 2차 점수 (빈칸)"]').count()) === 0 &&
  (await page.locator('input[aria-label="책임감 1차 점수 (빈칸)"]').count()) === 0 &&
  (await page.locator('[data-cell="second:responsibility"]').innerText()).trim() === "6",
);
for (const i of await blanksInputs.all()) await i.fill("10");
await page.getByRole("button", { name: "대신 입력 저장" }).click();
await page.waitForURL(`${BASE}/admin/final`);
await page.goto(`${BASE}/admin/final/fill/${blank}`);
await check("입력한 칸 옆에 \"관리자 대신 입력 (이름)\"이 보인다", async () =>
  (await page.locator('[data-cell="second:trust"]').innerText()).includes("관리자 대신 입력 (김파트장)") && !(await page.locator('[data-cell="second:responsibility"]').innerText()).includes("대신 입력"),
);
await page.goto(`${BASE}/admin/final?group=5`);
await check("저장하면 최종평가 화면에서 그 사람에게 최종점수와 등급이 생긴다", async () => {
  const t = await row("빈칸이").locator("td").allInnerTexts();
  return t[7] === "80.56" && t[8]!.trim() === "S"; // 6명: S1 A1 B3 C1 (작은 그룹도 S 1명)
});
await check("다시 계산으로 등급 경계가 바뀐 사람이 있으면 그 줄에 표시가 보인다", async () =>
  before === "S" && (await gradeOf("일번")) === "A" && (await row("일번").getByText("다시 계산으로 S→A").count()) === 1 && (await row("오번").getByText("다시 계산으로 B→C").count()) === 1,
);
await check("(기록) 대신 입력은 작업 기록에 남는다", async () => {
  const [r] = await sql`select count(*)::int n from audit_logs where action = 'score.proxy' and person_id = ${blank}`;
  return r!.n === 1;
});
await page.screenshot({ path: "/tmp/hr-e2e/11-final.png", fullPage: true });

await b.close();
await sql.end();
process.exit(summary());
