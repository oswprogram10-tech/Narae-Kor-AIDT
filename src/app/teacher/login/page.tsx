"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginTeacher, type FormState } from "@/app/actions/teacher";
import { FormMessage } from "@/components/FormMessage";

export default function TeacherLogin() {
  const [state, action, pending] = useActionState<FormState, FormData>(loginTeacher, {});
  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="mb-6 text-2xl font-bold">선생님 로그인</h1>
      <form action={action} className="card space-y-4">
        <div>
          <label className="label" htmlFor="email">이메일</label>
          <input className="input" id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div>
          <label className="label" htmlFor="password">비밀번호</label>
          <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        <FormMessage state={state} />
        <button className="btn-primary w-full" disabled={pending}>로그인</button>
      </form>
      <p className="mt-4 text-center text-sm text-stone-600">
        처음이신가요? <Link className="font-semibold text-brand-600 underline" href="/teacher/signup">계정 만들기</Link>
      </p>
    </main>
  );
}
