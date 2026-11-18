"use client";

import { useActionState } from "react";
import { createClass, type FormState } from "@/app/actions/teacher";
import { FormMessage } from "@/components/FormMessage";

export function CreateClassForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createClass, {});
  return (
    <form action={action} className="space-y-3">
      <div>
        <label className="label" htmlFor="name">학급 이름</label>
        <input className="input" id="name" name="name" placeholder="예: 4학년 2반" required />
      </div>
      <div>
        <label className="label" htmlFor="grade">학년</label>
        <select className="input" id="grade" name="grade" defaultValue="4">
          {[3, 4, 5, 6].map((g) => (
            <option key={g} value={g}>{g}학년</option>
          ))}
        </select>
      </div>
      <FormMessage state={state} />
      <button className="btn-primary" disabled={pending}>학급 만들기</button>
    </form>
  );
}
