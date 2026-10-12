// 빌드 뒤: 화면 파일(.next/static, public)을 실행 폴더(.next/standalone)로 복사한다. 윈도우·리눅스 모두 동작.
import { cpSync, existsSync, rmSync } from "node:fs";

const out = ".next/standalone";
if (!existsSync(out)) throw new Error("next build 결과(.next/standalone)가 없습니다.");
rmSync(`${out}/.next/static`, { recursive: true, force: true });
cpSync(".next/static", `${out}/.next/static`, { recursive: true });
if (existsSync("public")) cpSync("public", `${out}/public`, { recursive: true });
console.log("postbuild: 화면 파일 복사 완료");
