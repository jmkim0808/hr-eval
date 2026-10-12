// 시험 모드 준비: 가짜 관리자·대표이사 등록 + 올려 볼 가짜 명단 엑셀(시험자료/시험용-명단.xlsx) 만들기.
// 실제 직원 정보는 쓰지 않는다. HR_DEMO=on 일 때만 돈다.
import ExcelJS from "exceljs";
import { mkdirSync } from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { ROSTER_HEADERS } from "../src/domain/roster";
import { appUsers } from "../src/server/db/schema";

if (process.env.HR_DEMO !== "on") throw new Error("시험 모드(HR_DEMO=on)에서만 쓸 수 있습니다.");
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL이 없습니다.");
const client = postgres(url, { max: 1, prepare: false });
const db = drizzle(client);

const users = [
  { name: "김인사", email: "hr.admin@demo.test", employeeNo: "D0001", role: "admin" as const },
  { name: "이관리", email: "hr.admin2@demo.test", employeeNo: "D0002", role: "admin" as const },
  { name: "박대표", email: "ceo@demo.test", employeeNo: "D0003", role: "ceo" as const },
];
for (const u of users)
  await db.insert(appUsers).values(u).onConflictDoUpdate({ target: appUsers.email, set: { name: u.name, employeeNo: u.employeeNo, role: u.role, active: true } });
await client.end();

const year = Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "numeric" }).format(new Date()));
const E1 = "exec1@demo.test";
const E2 = "exec2@demo.test";
// 사번, 이름, 이메일, 부서, 직급, 입사일, 팀장 여부, 담당 임원
const rows: string[][] = [
  ["D1001", "정임원", E1, "", "상무", "2008-03-03", "아니오", ""],
  ["D1002", "한전무", E2, "", "전무", "2005-01-02", "아니오", ""],
  ["D1101", "최팀장", "lead.sales@demo.test", "영업1팀", "부장", "2012-07-02", "예", E1],
  ["D1102", "김대리", "kim@demo.test", "영업1팀", "대리", "2021-03-02", "아니오", E1],
  ["D1103", "박과장", "park@demo.test", "영업1팀", "과장", "2017-09-01", "아니오", E1],
  ["D1104", "이주임", "lee@demo.test", "영업1팀", "주임", "2022-01-03", "아니오", E1],
  ["D1105", "윤사원", "yoon@demo.test", "영업1팀", "사원", "2024-02-01", "아니오", E1],
  ["D1201", "오팀장", "lead.qa@demo.test", "품질팀", "차장", "2014-04-01", "예", E2],
  ["D1202", "강차장", "kang@demo.test", "품질팀", "차장", "2015-05-04", "아니오", E2],
  ["D1203", "서대리", "seo@demo.test", "품질팀", "대리", "2020-11-02", "아니오", E2],
  ["D1204", "문사원", "moon@demo.test", "품질팀", "사원", `${year}-08-01`, "아니오", E2],
  ["D1301", "장팀장", "lead.dev@demo.test", "개발팀", "부장", "2011-02-01", "예", E2],
  ["D1302", "임과장", "lim@demo.test", "개발팀", "과장", "2018-06-04", "아니오", E2],
  ["D1303", "조사원", "cho@demo.test", "개발팀", "사원", "2023-10-04", "아니오", E2],
];
const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet("직원 명단");
ws.addRow([...ROSTER_HEADERS]);
rows.forEach((r) => ws.addRow(r));
ws.columns.forEach((c) => (c.width = 16));
mkdirSync("시험자료", { recursive: true });
await wb.xlsx.writeFile("시험자료/시험용-명단.xlsx");
console.log("시험 준비 완료: 관리자 김인사(D0001)·이관리(D0002), 대표이사 박대표(D0003), 명단 엑셀 시험자료/시험용-명단.xlsx (14명)");
