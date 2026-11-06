"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signupTeacher, type FormState } from "@/app/actions/teacher";
import { FormMessage } from "@/components/FormMessage";

export default function TeacherSignup() {
  const [state, action, pending] = useActionState<FormState, FormData>(signupTeacher, {});
  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="mb-6 text-2xl font-bold">선생님 계정 만들기</h1>
      <form action={action} className="card space-y-4">
        <div>
          <label className="label" htmlFor="displayName">표시 이름</label>
          <input className="input" id="displayName" name="displayName" placeholder="예: 3학년 2반 담임" required />
        </div>
        <div>
          <label className="label" htmlFor="email">이메일</label>
          <input className="input" id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div>
          <label className="label" htmlFor="password">비밀번호 (8자 이상)</label>
          <input className="input" id="password" name="password" type="password" minLength={8} autoComplete="new-password" required />
        </div>
        <FormMessage state={state} />
        <button className="btn-primary w-full" disabled={pending}>계정 만들기</button>
      </form>
      <p className="mt-4 text-center text-sm text-stone-600">
        이미 계정이 있나요? <Link className="font-semibold text-brand-600 underline" href="/teacher/login">로그인</Link>
      </p>
    </main>
  );
}
