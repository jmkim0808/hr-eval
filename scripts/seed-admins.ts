// 처음 관리자 등록: npm run seed:admins -- "이름:이메일:사번" ...
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { appUsers } from "../src/server/db/schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL이 없습니다.");
const args = process.argv.slice(2);
if (args.length === 0) throw new Error('사용법: npm run seed:admins -- "이름:이메일:사번" ...');
const client = postgres(url, { max: 1, prepare: false });
const db = drizzle(client);
for (const arg of args) {
  const [name, email, employeeNo] = arg.split(":");
  if (!name || !email || !employeeNo) throw new Error(`형식 오류 (이름:이메일:사번): ${arg}`);
  await db
    .insert(appUsers)
    .values({ name: name.trim(), email: email.trim().toLowerCase(), employeeNo: employeeNo.trim(), role: "admin" })
    .onConflictDoUpdate({ target: appUsers.email, set: { name: name.trim(), employeeNo: employeeNo.trim(), role: "admin", active: true } });
}
await client.end();
console.log(`관리자 ${args.length}명 등록`);
