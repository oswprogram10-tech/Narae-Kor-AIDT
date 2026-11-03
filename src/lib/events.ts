import "server-only";
import { getDb, schema } from "@/lib/db";

export type Verb =
  | "stage_enter"
  | "help_request"
  | "coach_reply"
  | "coach_blocked"
  | "coach_limit"
  | "paste"
  | "autosave"
  | "submit"
  | "comment"
  | "rubric_ai"
  | "rubric_final"
  | "return"
  | "grammar_answer";

export async function logEvent(
  actor: string,
  verb: Verb,
  objectType: "submission" | "assignment",
  objectId: number,
  meta?: Record<string, unknown>,
) {
  const db = await getDb();
  await db.insert(schema.events).values({ actor, verb, objectType, objectId, meta });
}
