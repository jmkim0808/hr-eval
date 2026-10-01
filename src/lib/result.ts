/** 예상된 실패는 throw 하지 않고 이 모양으로 돌려준다 (docs/tech/03-규칙.md 14). */
export type Ok<T> = { ok: true; value: T };
export type Fail = { ok: false; code: string; message: string };
export type Result<T = undefined> = Ok<T> | Fail;

export const ok = <T = undefined>(value?: T): Ok<T> => ({ ok: true, value: value as T });
export const fail = (code: string, message: string): Fail => ({ ok: false, code, message });
