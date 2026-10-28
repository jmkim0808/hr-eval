/** 받침에 맞는 조사 (은/는, 이/가, 을/를). 한글이 아니면 뒤의 것(는·가·를) */
export function josa(word: string, pair: "은/는" | "이/가" | "을/를"): string {
  const [withFinal, withoutFinal] = pair.split("/") as [string, string];
  const code = word.trim().charCodeAt(word.trim().length - 1);
  if (code < 0xac00 || code > 0xd7a3) return word + withoutFinal;
  return word + ((code - 0xac00) % 28 ? withFinal : withoutFinal);
}
