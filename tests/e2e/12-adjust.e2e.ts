// PRD 12 확인 문장을 화면에서 점검한다. 가짜 명단.
import { BASE, browser, check, login, sql, summary } from "./helpers";

await sql`delete from email_outbox`;
await sql`delete from cycle_people`;
await sql`delete from review_cycles`;
await sql`delete from auth_codes`;
await sql`insert into app_users (email, name, role) values ('director@powernet.test', '이실장', 'admin') on conflict (email) do nothing`;
const year = Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "numeric" }).format(new Date()));
const [cyc] = await sql`insert into review_cycles (year, status, self_start, self_end, first_start, first_end, second_start, second_end, bonus_cutoff)
  values (${year}, 'second_review', '2026-09-01', '2026-09-05', '2026-09-08', '2026-09-12', '2026-09-15', '2026-09-19', '2026-09-05') returning id`;
const cycleId = cyc!.id as string;
const person = async (v: Record<string, unknown>) => {
  const [r] = await sql`insert into cycle_people ${sql({ cycle_id: cycleId, department: "영업1팀", position: "대리", hire_date: "2020-01-01", ...v })} returning id`;
  return r!.id as string;
};
const ITEMS = ["responsibility", "teamwork", "discipline", "objectivity", "execution", "knowledge", "information", "contribution", "communication", "trust", "achievement"];
async function scores(personId: string, rater: "first" | "second", v: number) {
  const [ev] = await sql`insert into evaluations (person_id, version) values (${personId}, 1) on conflict (person_id) do update set version = evaluations.version returning id`;
  for (const c of ITEMS) await sql`insert into evaluation_scores (evaluation_id, rater, item_code, score) values (${ev!.id}, ${rater}, ${c}, ${v})`;
}
const ex = await person({ email: "exec@powernet.test", name: "정임원", position: "상무", department: "", is_executive: true, is_target: false });
const ld = await person({ email: "lead@powernet.test", name: "최팀장", position: "부장", is_team_leader: true, grade_group: 1, form_type: "leader", first_reviewer_id: ex });
// 10명: 1차·2차 점수로 최종점수가 모두 다르게 (S1 A2 B4 C2 D1)
const names = ["일번", "이번", "삼번", "사번", "오번", "육번", "칠번", "팔번", "구번", "십번"];
const sc: [number, number][] = [[10, 10], [10, 9], [9, 9], [9, 8], [8, 8], [8, 7], [7, 7], [7, 6], [6, 6], [5, 5]];
for (let i = 0; i < 10; i++) {
  const id = await person({ email: `${names[i]}@powernet.test`, name: names[i], grade_group: 5, form_type: "member", first_reviewer_id: ld, second_reviewer_id: ex });
  await scores(id, "first", sc[i]![0]);
  await scores(id, "second", sc[i]![1]);
}

const b = await browser();
const page = await b.newPage({ viewport: { width: 1400, height: 1000 } });
await login(page, "part@powernet.test");
await page.goto(`${BASE}/admin`);
await page.getByRole("button", { name: "다음 단계로 넘기기" }).click();
await page.getByRole("button", { name: "넘기기", exact: true }).click();
await page.waitForTimeout(1500);
await page.goto(`${BASE}/admin/final?group=5`);
const row = (n: string) => page.locator(`tr[data-person="${n}"]`);
const pick = async (n: string, g: string) => {
  await row(n).getByRole("combobox").selectOption(g);
  await page.waitForSelector('[role="alertdialog"]');
};
const dialogText = () => page.locator('[role="alertdialog"]').innerText();
const finalOf = async (n: string) => (await row(n).locator("td").nth(7).innerText()).trim();
const gradeOf = async (n: string) => row(n).getByRole("combobox").inputValue();

await pick("이번", "S");
await check("A인 사람을 S로 바꾸면 확인 창에 그 사람과 S 최하단에서 A로 내려갈 사람이 함께 보인다", async () => {
  const t = await dialogText();
  return t.includes("이번") && t.includes("일번") && t.includes("조정 · 상향") && t.includes("밀려남 · 하향") && !t.includes("삼번");
});
await page.screenshot({ path: "/tmp/hr-e2e/12-dialog.png" });
await page.getByRole("button", { name: "취소" }).click();
await page.waitForTimeout(800);

await pick("일번", "A");
await check("S인 사람을 A로 바꾸면 A 최상단에서 S로 올라갈 사람이 함께 보인다", async () => {
  const t = await dialogText();
  return t.includes("일번") && t.includes("이번") && t.includes("올라감 · 상향") && !t.includes("삼번");
});
await page.getByRole("button", { name: "취소" }).click();
await page.waitForTimeout(800);

const before = { 삼번: await finalOf("삼번"), 일번: await finalOf("일번") };
const counts0 = await page.getByTestId("grade-counts").innerText();
// 두 번째 관리자 화면을 같은 판본으로 미리 열어 둔다
const p2 = await (await b.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
await login(p2, "director@powernet.test");
await p2.goto(`${BASE}/admin/final?group=5`);

await pick("삼번", "S");
await page.getByRole("button", { name: "적용" }).click();
await page.waitForTimeout(1500);
await page.reload();
await check("[적용] 뒤 그룹의 등급별 인원은 그대로이고, 두 사람 줄에 파란 \"↑ 조정 · 상향\" / 빨간 \"↓ 밀려남 · 하향\"이 글자와 함께 보인다", async () => {
  const t = await page.getByTestId("grade-counts").innerText();
  const up = row("삼번").getByText("조정 · 상향");
  const down = row("일번").getByText("밀려남 · 하향");
  const upClass = (await up.getAttribute("class")) ?? "";
  const downClass = (await down.getAttribute("class")) ?? "";
  return (
    counts0.includes("지금 S 1 · A 2 · B 4 · C 2 · D 1") && t.includes("지금 S 1 · A 2 · B 4 · C 2 · D 1") && (await gradeOf("삼번")) === "S" && (await gradeOf("일번")) === "A" && upClass.includes("grade-up") && downClass.includes("grade-down")
  );
});
await check("조정해도 두 사람의 최종점수 숫자는 바뀌지 않는다", async () => (await finalOf("삼번")) === before.삼번 && (await finalOf("일번")) === before.일번);
await page.screenshot({ path: "/tmp/hr-e2e/12-final.png", fullPage: true });

await p2.locator('tr[data-person="팔번"]').getByRole("combobox").selectOption("B");
await p2.waitForSelector('[role="alertdialog"]');
await p2.getByRole("button", { name: "적용" }).click();
await p2.waitForTimeout(1500);
await check("관리자 두 명이 동시에 다른 조정을 적용하면 나중 사람에게 \"다른 관리자가 먼저 처리했습니다\"가 보인다", async () => (await p2.getByText(/다른 관리자가 먼저 처리했습니다/).count()) >= 1 && (await gradeOf("팔번")) === "C");

await row("삼번").getByRole("button", { name: "되돌리기" }).click();
await page.waitForTimeout(1500);
await page.reload();
await check("[되돌리기]를 누르면 두 사람이 원래 등급으로 돌아간다", async () =>
  (await gradeOf("삼번")) === "A" && (await gradeOf("일번")) === "S" && (await row("삼번").getByText("조정").count()) === 0 && (await row("일번").getByText("밀려남").count()) === 0,
);

await b.close();
await sql.end();
process.exit(summary());
