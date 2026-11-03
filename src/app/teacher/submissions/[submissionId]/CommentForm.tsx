"use client";

import { useActionState } from "react";
import { addComment, type FormState } from "@/app/actions/teacher";
import { FormMessage } from "@/components/FormMessage";

export function CommentForm({ submissionId }: { submissionId: number }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addComment, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="submissionId" value={submissionId} />
      <textarea className="input min-h-20 text-sm" name="content" placeholder="잘한 점과 다음에 생각해 볼 점을 적어 주세요." />
      <FormMessage state={state} />
      <button className="btn-primary text-sm" disabled={pending}>코멘트 남기기</button>
    </form>
  );
}
