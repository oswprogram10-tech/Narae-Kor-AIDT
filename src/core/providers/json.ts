import { z } from "zod";

// zod 스키마 → JSON 스키마(OpenAI strict 모드와 Gemini가 받아들이는 형태). $schema 키는 뺀다.
export function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const out = z.toJSONSchema(schema) as Record<string, unknown>;
  delete out.$schema;
  return out;
}

// 모델이 돌려준 문자열을 JSON으로 읽고 스키마로 검증한다. 코드 블록(```json)으로 감싼 경우도 처리.
export function parseJsonOutput<T>(text: string, schema: z.ZodType<T>): T | null {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  let data: unknown;
  try {
    data = JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      data = JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  const r = schema.safeParse(data);
  return r.success ? r.data : null;
}
