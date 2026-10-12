// 대표이사 처음 등록 (PRD 13): npm run seed:ceo -- "이름:이메일:사번"
// 관리자 설정 화면에는 넣지 않는다. 바뀌면 이 명령을 다시 실행한다.
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { appUsers } from "../src/server/db/schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL이 없습니다.");
const [arg] = process.argv.slice(2);
const [name, email, employeeNo] = (arg ?? "").split(":");
if (!name || !email || !employeeNo) throw new Error('사용법: npm run seed:ceo -- "이름:이메일:사번"');
const client = postgres(url, { max: 1, prepare: false });
await drizzle(client)
  .insert(appUsers)
  .values({ name: name.trim(), email: email.trim().toLowerCase(), employeeNo: employeeNo.trim(), role: "ceo" })
  .onConflictDoUpdate({ target: appUsers.email, set: { name: name.trim(), employeeNo: employeeNo.trim(), role: "ceo", active: true } });
await client.end();
console.log("대표이사 등록");
