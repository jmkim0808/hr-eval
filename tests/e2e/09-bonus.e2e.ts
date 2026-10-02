// PRD 09 확인 문장을 화면에서 점검한다. 가짜 명단.
import ExcelJS from "exceljs";
import { mkdirSync, writeFileSync } from "node:fs";
import { BASE, browser, check, login, sql, summary } from "./helpers";

await sql`delete from email_outbox`;
await sql`delete from cycle_people`;
await sql`delete from review_cycles`;
await sql`delete from auth_codes`;
const year = Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "numeric" }).format(new Date()));
const [cyc] = await sql`insert into review_cycles (year, status, self_start, self_end, first_start, first_end, second_start, second_end, bonus_cutoff)
  values (${year}, 'self_review', '2026-11-03', '2026-11-07', '2026-11-10', '2026-11-14', '2026-11-17', '2026-11-21', '2026-11-14') returning id`;
const cycleId = cyc!.id as string;
const person = async (v: Record<string, unknown>) => {
  const [r] = await sql`insert into cycle_people ${sql({ cycle_id: cycleId, department: "영업1팀", position: "대리", hire_date: "2020-01-01", ...v })} returning id`;
  return r!.id as string;
};
const ex = await person({ email: "exec@powernet.test", name: "정임원", position: "상무", department: "", is_executive: true, is_target: false });
const ld = await person({ email: "lead@powernet.test", name: "최팀장", position: "부장", is_team_leader: true, grade_group: 1, form_type: "leader", first_reviewer_id: ex });
for (const [email, name] of [["kim@powernet.test", "김대리"], ["park@powernet.test", "박과장"], ["lee@powernet.test", "이주임"]]) {
  await person({ email, name, grade_group: 5, form_type: "member", first_reviewer_id: ld, second_reviewer_id: ex });
}

const b = await browser();
const page = await b.newPage({ viewport: { width: 1400, height: 1000 }, acceptDownloads: true });
await login(page, "part@powernet.test");
await page.goto(`${BASE}/admin/bonus`);

const dl = page.waitForEvent("download");
await page.getByRole("button", { name: "템플릿 내려받기" }).click();
const tpl = await (await dl).path();
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(tpl!);
const ws = wb.worksheets[0]!;
const head = (ws.getRow(1).values as unknown[]).slice(1).join("|");
const rowByName = (n: string) => { let found = 0; ws.eachRow((r, i) => { if (r.getCell(1).value === n) found = i; }); return ws.getRow(found); };
await check("템플릿에 항목별 칸이 있고, 다면평가 칸은 팀장 줄에만 입력할 수 있다", async () =>
  head === "이름|이메일|부서|자격증|포상|직무발명보상|교육참여도|징계사항|내부회계관리제도|다면평가(팀장만)" && rowByName("김대리").getCell(10).value === "—" && rowByName("최팀장").getCell(10).value !== "—",
);

// 작성: 김대리 자격증 2·징계 -0.5, 최팀장 다면평가 3, 박과장 이름 틀림, 모르는 이메일 1줄
rowByName("김대리").getCell(4).value = 2;
rowByName("김대리").getCell(8).value = -0.5;
rowByName("최팀장").getCell(10).value = 3;
rowByName("박과장").getCell(1).value = "박과장님";
rowByName("이주임").getCell(10).value = 1; // 팀원 다면평가 → 확인 필요
ws.addRow(["홍길동", "nobody@powernet.test", "품질팀", 1]);
mkdirSync("/tmp/hr-e2e", { recursive: true });
writeFileSync("/tmp/hr-e2e/bonus.xlsx", Buffer.from(await wb.xlsx.writeBuffer()));
await page.setInputFiles('input[type="file"]', "/tmp/hr-e2e/bonus.xlsx");
await page.waitForSelector("text=/명 일치/");
await check("올리면 \"N명 중 M명 일치 · 이름이 맞지 않는 K명\"이 보이고, 맞지 않는 사람은 따로 표시된다", async () => {
  const t = await page.locator("main").innerText();
  return /5명 중 2명 일치\s*· 이름이 맞지 않는 2명/.test(t) && t.includes("박과장님") && t.includes("홍길동") && t.includes("팀원은 다면평가를 넣을 수 없습니다");
});
await page.getByRole("button", { name: "2명 반영하기" }).click();
await page.waitForSelector("text=반영 완료");
await page.reload();
const cells = async (n: string) => page.locator(`tr[data-person="${n}"] td`).allInnerTexts();
await check("[반영하기] 뒤 가점 표에 항목별 점수와 합계가 보인다", async () => {
  const k = await cells("김대리");
  const l = await cells("최팀장");
  return k[2] === "2" && l[8] === "3" && l[9] === "3";
});
await check("징계사항은 음수로 넣을 수 있고 합계에서 빠진다", async () => {
  const k = await cells("김대리");
  return k[6] === "-0.5" && k[9] === "1.5";
});
await check("팀원 줄의 다면평가 칸은 \"—\"로 보이고 입력할 수 없다", async () => {
  const k = await cells("이주임");
  await page.locator('tr[data-person="이주임"]').click();
  await page.waitForSelector('[role="dialog"]');
  const disabled = await page.locator("#b-multi_rater").isDisabled();
  await page.fill("#b-education", "0.5");
  await page.getByRole("button", { name: "저장" }).click();
  await page.waitForTimeout(1500);
  const after = await cells("이주임");
  return k[8] === "—" && disabled && after[5] === "0.5" && after[9] === "0.5";
});
await check("2차평가 기간 전이어도 가점을 넣을 수 있다", async () => {
  const [c] = await sql`select status from review_cycles where id = ${cycleId}`;
  const [n] = await sql`select count(distinct person_id)::int n from bonus_points`;
  return c!.status === "self_review" && n!.n === 3;
});
await page.screenshot({ path: "/tmp/hr-e2e/09-bonus.png", fullPage: true });
await page.goto(`${BASE}/admin`);
await check("진행 현황에 \"가점 반영 N / 전체\"가 보인다", async () => (await page.getByTestId("bonus-count").innerText()).replace(/\s+/g, " ") === "가점 반영 3 / 4");

await b.close();
await sql.end();
process.exit(summary());
