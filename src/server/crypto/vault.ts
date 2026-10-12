// 내용 암호화 (ADR-0021). 점수·업적 글·가점·최종평가·등급조정을 AES-256-GCM으로 바꿔 저장한다.
// 데이터 열쇠(DEK)는 서버 메모리에만 있다. DB에는 관리자 비밀 문구로 잠근 열쇠(열쇠 칸)만 남는다.
// → 서버·DB 관리자(전산)가 DB를 열어 봐도 점수·글·등급은 알아볼 수 없다. 서버가 다시 켜지면 관리자가 비밀 문구를 넣어야 열린다.
import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from "node:crypto";

const PREFIX = "e1:";
const KDF_ITERATIONS = 600_000; // PBKDF2-SHA256 (OWASP 권고 수준)
export const PASSPHRASE_MIN = 12;

export class VaultLocked extends Error {
  constructor() {
    super("vault locked");
  }
}

const g = globalThis as unknown as { __hrDek?: Buffer | null };
export const isOpen = () => !!g.__hrDek;
export const openWith = (dek: Buffer) => void (g.__hrDek = dek);
export const close = () => {
  g.__hrDek?.fill(0);
  g.__hrDek = null;
};
function key(): Buffer {
  if (!g.__hrDek) throw new VaultLocked();
  return g.__hrDek;
}

const b64 = (b: Buffer) => b.toString("base64url");

/** 빈 글은 빈 글로 둔다 (작성 전/작성 중 구분용 — 내용은 드러나지 않음). 나머지는 매번 다른 암호문 */
export function enc(plain: string): string {
  if (plain === "") return "";
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return PREFIX + b64(Buffer.concat([iv, body, c.getAuthTag()]));
}

export function dec(cipher: string): string {
  if (cipher === "") return "";
  if (!cipher.startsWith(PREFIX)) throw new Error("암호화되지 않은 값이 들어 있습니다");
  const raw = Buffer.from(cipher.slice(PREFIX.length), "base64url");
  const d = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(raw.length - 16));
  return Buffer.concat([d.update(raw.subarray(12, raw.length - 16)), d.final()]).toString("utf8");
}

export const encNum = (n: number | null | undefined) => (n === null || n === undefined ? null : enc(String(n)));
export const decNum = (s: string | null | undefined) => (s === null || s === undefined || s === "" ? null : Number(dec(s)));
export const encOpt = (s: string | null | undefined) => (s === null || s === undefined ? null : enc(s));
export const decOpt = (s: string | null | undefined) => (s === null || s === undefined ? null : dec(s));

// ── 열쇠 칸: 관리자마다 자기 비밀 문구로 같은 데이터 열쇠를 잠가 둔다 ──

export type Slot = { salt: string; iterations: number; wrapped: string };

const kek = (passphrase: string, salt: Buffer, iterations: number) => pbkdf2Sync(passphrase.normalize("NFC"), salt, iterations, 32, "sha256");

export function newDataKey(): Buffer {
  return randomBytes(32);
}

export function wrapKey(dek: Buffer, passphrase: string): Slot {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", kek(passphrase, salt, KDF_ITERATIONS), iv);
  const body = Buffer.concat([c.update(dek), c.final()]);
  return { salt: b64(salt), iterations: KDF_ITERATIONS, wrapped: b64(Buffer.concat([iv, body, c.getAuthTag()])) };
}

/** 지금 열린 데이터 열쇠를 새 비밀 문구로 한 번 더 잠근다 (관리자 열쇠 칸 추가) */
export const wrapCurrent = (passphrase: string) => wrapKey(key(), passphrase);

/** 비밀 문구가 맞으면 데이터 열쇠, 틀리면 null */
export function unwrapKey(slot: Slot, passphrase: string): Buffer | null {
  try {
    const raw = Buffer.from(slot.wrapped, "base64url");
    const d = createDecipheriv("aes-256-gcm", kek(passphrase, Buffer.from(slot.salt, "base64url"), slot.iterations), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(raw.length - 16));
    return Buffer.concat([d.update(raw.subarray(12, raw.length - 16)), d.final()]);
  } catch {
    return null;
  }
}
