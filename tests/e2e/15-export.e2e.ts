// PRD 15 확인 문장을 화면에서 점검한다. 가짜 명단.
import ExcelJS from "exceljs";
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
const MEMBER = ["responsibility", "teamwork", "discipline", "objectivity", "execution", "knowledge", "information", "contribution", "communication", "trust", "achievement"];
const LEADER = ["responsibility", "teamwork", "discipline", "objectivity", "knowledge", "information", "contribution", "leadership", "communication", "planning", "achievement"];
async function scores(personId: string, rater: "first" | "second", v: number, codes = MEMBER, text = "") {
  const [ev] = await sql`insert into evaluations (person_id, achievement_text, version) values (${personId}, ${text}, 1) on conflict (person_id) do update set version = evaluations.version returning id`;
  for (const c of codes) await sql`insert into evaluation_scores (evaluation_id, rater, item_code, score) values (${ev!.id}, ${rater}, ${c}, ${v})`;
}
const ex = await person({ email: "exec@powernet.test", name: "정임원", position: "상무", department: "", is_executive: true, is_target: false });
const ld = await person({ email: "lead@powernet.test", name: "최팀장", position: "부장", is_team_leader: true, grade_group: 1, form_type: "leader", first_reviewer_id: ex });
await scores(ld, "first", 8, LEADER);
const members: [string, number, number][] = [["=SUM(1,2)", 10, 10], ["이번", 9, 9], ["삼번", 9, 8], ["사번", 8, 8], ["오번", 7, 7]];
for (const [name, f, s] of members) {
  const id = await person({ email: `m${f}${s}@powernet.test`, name, department: name === "사번" ? "@품질팀" : "영업1팀", grade_group: 5, form_type: "member", first_reviewer_id: ld, second_reviewer_id: ex });
  await scores(id, "first", f, MEMBER, name === "이번" ? "=HYPERLINK(\"http://x\")" : "업적");
  await scores(id, "second", s);
}

const b = await browser();
const page = await b.newPage({ viewport: { width: 1400, height: 1000 }, acceptDownloads: true });
await login(page, "part@powernet.test");
await page.goto(`${BASE}/admin/results`);
await check("확정 전에는 [최종결과 엑셀 내려받기]가 눌리지 않는다", async () => page.getByRole("button", { name: "최종결과 엑셀 내려받기" }).isDisabled());

await page.goto(`${BASE}/admin`);
await page.getByRole("button", { name: "다음 단계로 넘기기" }).click();
await page.getByRole("button", { name: "넘기기", exact: true }).click();
await page.waitForTimeout(1500);
await page.reload();
const afterAdvance = (await page.getByText("지금 백업을 내려받아 보관하세요").count()) === 1;
// 백업 받기 (안내 안의 버튼)
const dl1 = page.waitForEvent("download");
await page.locator('[role="alert"]').getByRole("button", { name: "전체 기록 백업 내려받기" }).click();
await (await dl1).path();
await page.waitForTimeout(1200);
const goneAfterBackup = (await page.getByText("지금 백업을 내려받아 보관하세요").count()) === 0;

// 등급조정 하나 (이력용) 후 확정
await page.goto(`${BASE}/admin/final?group=5`);
await page.locator('tr[data-person="이번"]').getByRole("combobox").selectOption("A");
await page.waitForSelector('[role="alertdialog"]');
await page.getByRole("button", { name: "적용" }).click();
await page.waitForTimeout(1500);
await page.reload();
await page.getByRole("button", { name: "확정", exact: true }).click();
await page.waitForSelector('[role="alertdialog"]');
await page.locator('[role="alertdialog"]').getByRole("button", { name: "확정", exact: true }).click();
await page.waitForTimeout(1500);
await page.reload();
await check("다음 단계로 넘기기와 확정 직후 백업 안내가 보인다", async () => afterAdvance && goneAfterBackup && (await page.getByText("지금 백업을 내려받아 보관하세요").count()) === 1);
const screen = new Map<string, string[]>();
for (const tr of await page.locator("tbody tr").all()) {
  const t = await tr.locator("td").allInnerTexts();
  screen.set(t[1]!.trim(), t.map((x) => x.trim()));
}

await page.goto(`${BASE}/admin/results`);
const dl2 = page.waitForEvent("download");
await page.getByRole("button", { name: "최종결과 엑셀 내려받기" }).click();
const finalFile = await (await dl2).path();
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(finalFile!);
const ws = wb.worksheets[0]!;
const head = (ws.getRow(1).values as unknown[]).slice(1) as string[];
const col = (h: string) => head.indexOf(h) + 1;
await check("내려받은 최종결과 엑셀에 이름·부서·그룹·최종점수·평가등급이 있고 화면 숫자와 같다", async () => {
  if (["이름", "부서", "그룹", "최종점수", "평가등급"].some((h) => col(h) === 0)) return false;
  let same = 0;
  ws.eachRow((r, i) => {
    if (i === 1) return;
    const name = String(r.getCell(col("이름")).value).replace(/^'/, "");
    const s = screen.get(name);
    if (s && Number(r.getCell(col("최종점수")).value).toFixed(2) === s[7] && r.getCell(col("평가등급")).value === s[9]!.slice(0, 1)) same++;
  });
  return same === 5;
});
await check("\"=\"로 시작하는 이름이나 글이 있어도 엑셀에서 수식으로 실행되지 않는다", async () => {
  let ok = true;
  ws.eachRow((r) => r.eachCell((c) => { if (c.formula || c.type === ExcelJS.ValueType.Formula) ok = false; }));
  const names: string[] = [];
  ws.eachRow((r, i) => i > 1 && names.push(String(r.getCell(col("이름")).value)));
  return ok && names.includes("'=SUM(1,2)") && !names.includes("=SUM(1,2)");
});

const dl3 = page.waitForEvent("download");
await page.goto(`${BASE}/admin`);
await page.locator("main").getByRole("button", { name: "전체 기록 백업 내려받기" }).last().click();
const backupFile = await (await dl3).path();
const bw = new ExcelJS.Workbook();
await bw.xlsx.readFile(backupFile!);
await check("백업 엑셀에 시트가 나뉘어 있고, 등급조정 이력(누가·언제·무엇을)이 들어 있다", async () => {
  const names = bw.worksheets.map((w) => w.name);
  const h = bw.getWorksheet("등급조정 이력");
  const r2 = h?.getRow(2).values as unknown[] | undefined;
  const ev = bw.getWorksheet("평가지");
  let formula = false;
  ev?.eachRow((r) => r.eachCell((c) => { if (c.formula) formula = true; }));
  return (
    ["명단", "평가지", "점수", "가점", "최종평가", "등급조정 이력"].every((n) => names.includes(n)) &&
    !!r2 && String(r2[2]).includes("part@powernet.test") && /\d{4}-\d{2}-\d{2}/.test(String(r2[1])) && String(r2[4]) === "B → A" && !formula
  );
});
await check("백업을 내려받으면 작업 기록에 남는다", async () => {
  const [r] = await sql`select count(*)::int n from audit_logs where action = 'export.backup' and cycle_id = ${cycleId}`;
  return r!.n === 2;
});

await b.close();
await sql.end();
process.exit(summary());
