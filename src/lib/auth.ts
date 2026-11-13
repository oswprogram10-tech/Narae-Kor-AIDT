import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

const COOKIE = "narae_session";
const MAX_AGE_SEC = 60 * 60 * 12; // 12시간(하루 수업 기준)

export type Session =
  | { kind: "teacher"; teacherId: number }
  | { kind: "student"; studentId: number; classId: number };

let warned = false;
function secretKey(): Uint8Array {
  let secret = process.env.SESSION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET 환경 변수를 설정해야 합니다(32자 이상 무작위 문자열).");
    }
    if (!warned) {
      console.warn("[narae] SESSION_SECRET이 없어 개발용 기본값을 사용합니다.");
      warned = true;
    }
    secret = "dev-only-insecure-secret-change-me-0123456789";
  }
  return new TextEncoder().encode(secret);
}

export async function createSession(session: Session): Promise<void> {
  const token = await new SignJWT({ ...session })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SEC}s`)
    .sign(secretKey());
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SEC,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (payload.kind === "teacher" && typeof payload.teacherId === "number") {
      return { kind: "teacher", teacherId: payload.teacherId };
    }
    if (
      payload.kind === "student" &&
      typeof payload.studentId === "number" &&
      typeof payload.classId === "number"
    ) {
      return { kind: "student", studentId: payload.studentId, classId: payload.classId };
    }
    return null;
  } catch {
    return null;
  }
}

export async function requireTeacher(): Promise<{ teacherId: number }> {
  const s = await getSession();
  if (!s || s.kind !== "teacher") redirect("/teacher/login");
  return { teacherId: s.teacherId };
}

export async function requireStudent(): Promise<{ studentId: number; classId: number }> {
  const s = await getSession();
  if (!s || s.kind !== "student") redirect("/join");
  return { studentId: s.studentId, classId: s.classId };
}

export const hashSecret = (plain: string) => bcrypt.hash(plain, 10);
export const verifySecret = (plain: string, hash: string) => bcrypt.compare(plain, hash);

// 교사가 해당 학급의 담임인지 확인한다. 아니면 null.
export async function ownedClass(teacherId: number, classId: number) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(schema.classes)
    .where(and(eq(schema.classes.id, classId), eq(schema.classes.teacherId, teacherId)));
  return row ?? null;
}

// 교사가 해당 과제의 학급 담임인지 확인한다.
export async function ownedAssignment(teacherId: number, assignmentId: number) {
  const db = await getDb();
  const [row] = await db
    .select({ assignment: schema.assignments, klass: schema.classes })
    .from(schema.assignments)
    .innerJoin(schema.classes, eq(schema.assignments.classId, schema.classes.id))
    .where(and(eq(schema.assignments.id, assignmentId), eq(schema.classes.teacherId, teacherId)));
  return row ?? null;
}
