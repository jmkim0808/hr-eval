import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/platform/env";
import * as schema from "./schema";

// 사내 서버(Node 하나가 계속 떠 있음)에서는 연결 묶음 하나를 같이 쓴다. 120명 규모라 최대 5개면 충분하다.
function create() {
  const client = postgres(env.databaseUrl, { max: 5, idle_timeout: 60, connect_timeout: 10 });
  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof create>;

const g = globalThis as unknown as { __hrDb?: Db };
export function getDb(): Db {
  g.__hrDb ??= create();
  return g.__hrDb;
}
