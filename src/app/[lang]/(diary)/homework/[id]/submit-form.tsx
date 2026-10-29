"use client";

import { useActionState } from "react";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { submitHomework } from "@/app/actions";

export function SubmitForm({
  homeworkId,
  defaultContent,
  defaultLinks,
  submitLabel,
  labels,
  errors,
  ok,
}: {
  homeworkId: string;
  defaultContent: string;
  defaultLinks: string;
  submitLabel: string;
  labels: Dictionary["homework"];
  errors: Dictionary["errors"];
  ok: Dictionary["ok"];
}) {
  const [state, action, pending] = useActionState(submitHomework, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="homeworkId" value={homeworkId} />
      <label className="block">
        <span className="mb-1 block text-sm font-medium">{labels.answer}</span>
        <textarea name="content" rows={6} defaultValue={defaultContent} className="field resize-y" />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">{labels.links}</span>
        <textarea
          name="links"
          rows={2}
          defaultValue={defaultLinks}
          placeholder={labels.linksPlaceholder}
          className="field resize-y font-mono text-sm"
        />
      </label>
      {state?.error && <p className="rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">{errors[state.error]}</p>}
      {state?.ok && <p className="rounded-xl bg-good-soft px-3 py-2 text-sm text-good">{ok[state.ok]}</p>}
      <button type="submit" disabled={pending} className="btn w-full">
        {pending ? labels.submitting : submitLabel}
      </button>
    </form>
  );
}
