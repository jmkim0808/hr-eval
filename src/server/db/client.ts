import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { cache } from "react";
import { env } from "@/platform/env";
import * as schema from "./schema";

// Cloudflare Workers는 요청 사이에 연결을 들고 있을 수 없으므로 요청마다 하나를 만든다.
// (Supabase 연결 풀 6543 포트 사용 — prepare 끔)
function create() {
  const client = postgres(env.databaseUrl, { max: 1, prepare: false, idle_timeout: 5, connect_timeout: 10 });
  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof create>;

/** 요청 하나 안에서는 같은 연결을 쓴다. 요청 밖(스크립트·테스트)에서는 매번 새로 만든다. */
export const getDb: () => Db = cache(create);
