export const clampStr = (x: unknown, max: number): string =>
  typeof x === "string" ? Array.from(x.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")).slice(0, max).join("") : "";
export const asRecord = (x: unknown): Record<string, unknown> => (x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {});
export const ID_RE = /^[a-z0-9]{1,8}$/;
export const len = (s: string) => Array.from(s.trim()).length;
/** 띄어쓰기를 모두 뺀 글 */
export const squash = (s: string) => s.replace(/\s+/g, "");

/** 목록의 id를 검사한다: 형식이 틀리거나 겹치면 `${prefix}${n}`으로 새로 정한다. */
export function uniqueId(raw: unknown, seen: Set<string>, prefix: string): string {
  let id = typeof raw === "string" && ID_RE.test(raw) && !seen.has(raw) ? raw : "";
  for (let n = seen.size + 1; !id; n++) if (!seen.has(`${prefix}${n}`)) id = `${prefix}${n}`;
  seen.add(id);
  return id;
}
