// 보안 열쇠 복구 코드 (2026-10-26). 사람이 옮겨 적기 쉬운 30글자(5글자×6묶음), 헷갈리는 글자(I·L·O·U) 없음 → 150비트.
// 인쇄해 금고에 보관한다. 비밀 문구를 잊거나 담당자가 바뀌었을 때 이것으로 연다.
import { randomInt } from "node:crypto";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford Base32
const GROUPS = 6;
const SIZE = 5;

export function newRecoveryCode(): string {
  const chars = Array.from({ length: GROUPS * SIZE }, () => ALPHABET[randomInt(ALPHABET.length)]!);
  return Array.from({ length: GROUPS }, (_, i) => chars.slice(i * SIZE, (i + 1) * SIZE).join("")).join("-");
}

/** 띄어쓰기·줄표·대소문자를 무시하고, 헷갈리기 쉬운 글자를 바로잡는다 (O→0, I·L→1). 형식이 아니면 null */
export function normalizeRecoveryCode(input: string): string | null {
  const s = input.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  if (s.length !== GROUPS * SIZE || [...s].some((c) => !ALPHABET.includes(c))) return null;
  return Array.from({ length: GROUPS }, (_, i) => s.slice(i * SIZE, (i + 1) * SIZE)).join("-");
}
