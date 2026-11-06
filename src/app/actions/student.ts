"use server";

import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { createSession, destroySession, hashSecret, verifySecret } from "@/lib/auth";
import { isValidPin } from "@/lib/pin";

export interface ClassLookup {
  error?: string;
  className?: string;
  grade?: number;
}

export async function lookupClass(code: string): Promise<ClassLookup> {
  const db = await getDb();
  const [k] = await db
    .select({ name: schema.classes.name, grade: schema.classes.grade })
    .from(schema.classes)
    .where(eq(schema.classes.joinCode, code.trim().toUpperCase()));
  if (!k) return { error: "참여 코드를 다시 확인해 주세요." };
  return { className: k.name, grade: k.grade };
}

export interface StudentStatus {
  error?: string;
  needsSetup?: boolean; // 처음 들어오거나 선생님이 그림 비밀번호를 초기화한 경우
  nickname?: string;
}

export async function checkStudent(code: string, number: number): Promise<StudentStatus> {
  if (!Number.isInteger(number) || number < 1 || number > 60) return { error: "번호를 확인해 주세요." };
  const db = await getDb();
  const [k] = await db.select().from(schema.classes).where(eq(schema.classes.joinCode, code.trim().toUpperCase()));
  if (!k) return { error: "참여 코드를 다시 확인해 주세요." };
  const [s] = await db
    .select()
    .from(schema.students)
    .where(and(eq(schema.students.classId, k.id), eq(schema.students.number, number)));
  if (!s) return { needsSetup: true };
  return { needsSetup: s.pinHash === "", nickname: s.nickname };
}

// 그림 비밀번호를 무작위로 맞히는 것을 막기 위한 간단한 잠금(서버 메모리 기준).
const failures = new Map<string, { count: number; until: number }>();
const MAX_FAILS = 5;
const LOCK_MS = 5 * 60_000;

export async function studentLogin(input: {
  code: string;
  number: number;
  pin: string;
  nickname?: string;
}): Promise<{ error?: string }> {
  const code = input.code.trim().toUpperCase();
  const key = `${code}:${input.number}`;
  const f = failures.get(key);
  if (f && f.until > Date.now()) return { error: "여러 번 틀려서 잠시 잠겼어요. 5분 뒤에 다시 하거나 선생님께 말씀드리세요." };
  if (!isValidPin(input.pin)) return { error: "그림 4개를 골라 주세요." };

  const db = await getDb();
  const [k] = await db.select().from(schema.classes).where(eq(schema.classes.joinCode, code));
  if (!k) return { error: "참여 코드를 다시 확인해 주세요." };
  const [s] = await db
    .select()
    .from(schema.students)
    .where(and(eq(schema.students.classId, k.id), eq(schema.students.number, input.number)));

  let studentId: number;
  if (!s || s.pinHash === "") {
    const nickname = (input.nickname ?? "").trim().slice(0, 12);
    if (!nickname && !s) return { error: "별명을 입력해 주세요." };
    const pinHash = await hashSecret(input.pin);
    if (s) {
      await db
        .update(schema.students)
        .set({ pinHash, ...(nickname ? { nickname } : {}) })
        .where(eq(schema.students.id, s.id));
      studentId = s.id;
    } else {
      const [created] = await db
        .insert(schema.students)
        .values({ classId: k.id, number: input.number, nickname, pinHash })
        .onConflictDoNothing()
        .returning({ id: schema.students.id });
      if (!created) return { error: "이미 등록된 번호예요. 다시 시도해 주세요." };
      studentId = created.id;
    }
  } else {
    if (!(await verifySecret(input.pin, s.pinHash))) {
      const next = (f?.count ?? 0) + 1;
      failures.set(key, { count: next, until: next >= MAX_FAILS ? Date.now() + LOCK_MS : 0 });
      return { error: "그림 비밀번호가 맞지 않아요." };
    }
    studentId = s.id;
  }
  failures.delete(key);
  await createSession({ kind: "student", studentId, classId: k.id });
  return {};
}

export async function studentLogout(): Promise<void> {
  await destroySession();
  redirect("/join");
}
