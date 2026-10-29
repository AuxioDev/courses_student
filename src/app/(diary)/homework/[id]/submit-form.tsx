"use client";

import { useActionState } from "react";
import { submitHomework } from "@/app/actions";

export function SubmitForm({
  homeworkId,
  defaultContent,
  defaultLinks,
  submitLabel,
}: {
  homeworkId: string;
  defaultContent: string;
  defaultLinks: string;
  submitLabel: string;
}) {
  const [state, action, pending] = useActionState(submitHomework, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="homeworkId" value={homeworkId} />
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Answer</span>
        <textarea name="content" rows={6} defaultValue={defaultContent} className="field resize-y" />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Links</span>
        <textarea
          name="links"
          rows={2}
          defaultValue={defaultLinks}
          placeholder="https://docs.google.com/… (one per line)"
          className="field resize-y font-mono text-sm"
        />
      </label>
      {state?.error && <p className="rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">{state.error}</p>}
      {state?.ok && <p className="rounded-xl bg-good-soft px-3 py-2 text-sm text-good">{state.ok}</p>}
      <button type="submit" disabled={pending} className="btn w-full">
        {pending ? "Submitting…" : submitLabel}
      </button>
    </form>
  );
}
