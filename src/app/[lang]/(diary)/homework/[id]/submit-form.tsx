"use client";

import { useActionState, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { fmt } from "@/i18n/format";
import { submitHomework } from "@/app/actions";
import { FileUploader, type UploadedFile } from "@/components/file-uploader";

type Draft = { content: string; links: string; savedAt: number };

// Unfinished answers are kept in this browser only, per student and homework.
function draftKey(studentId: string, homeworkId: string) {
  return `diary:draft:v1:${studentId}:${homeworkId}`;
}

function readDraftRaw(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function parseDraft(raw: string | null): Draft | null {
  try {
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

// Other tabs editing the same homework update this one too.
function subscribeToStorage(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function writeDraft(key: string, draft: Draft | null) {
  try {
    if (draft) localStorage.setItem(key, JSON.stringify(draft));
    else localStorage.removeItem(key);
  } catch {
    // Storage blocked (private mode): drafts just aren't kept.
  }
}

export function SubmitForm({
  homeworkId,
  studentId,
  lastSubmittedAt,
  defaultContent,
  defaultLinks,
  submitLabel,
  files,
  keepFrom,
  labels,
  fileLabels,
  attemptLabels,
  errors,
  ok,
}: {
  homeworkId: string;
  studentId: string;
  lastSubmittedAt: number;
  defaultContent: string;
  defaultLinks: string;
  submitLabel: string;
  files: UploadedFile[];
  keepFrom: { number: number; names: string[] } | null;
  labels: Dictionary["homework"];
  fileLabels: Dictionary["files"];
  attemptLabels: Dictionary["attempts"];
  errors: Dictionary["errors"];
  ok: Dictionary["ok"];
}) {
  const key = draftKey(studentId, homeworkId);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [draftStatus, setDraftStatus] = useState<"none" | "saved" | "dismissed">("none");
  const [state, action, pending] = useActionState(async (prev: Parameters<typeof submitHomework>[0], data: FormData) => {
    // A save still waiting from the last keystroke would otherwise land after the hand-in.
    clearTimeout(saveTimer.current);
    const result = await submitHomework(prev, data);
    // A successful hand-in makes the draft obsolete.
    if (result?.ok) {
      writeDraft(key, null);
      setDraftStatus("none");
    }
    return result;
  }, undefined);
  const content = useRef<HTMLTextAreaElement>(null);
  const links = useRef<HTMLTextAreaElement>(null);

  // The server render has no drafts; the browser reads one after hydration.
  const draftRaw = useSyncExternalStore(subscribeToStorage, () => readDraftRaw(key), () => null);
  const saved = parseDraft(draftRaw);
  const restorable =
    saved !== null &&
    saved.savedAt > lastSubmittedAt &&
    (saved.content !== defaultContent || saved.links !== defaultLinks);

  // Put a newer draft back into the fields (DOM only, no state).
  const restoredFor = useRef<string | null>(null);
  useEffect(() => {
    if (!restorable || !saved || restoredFor.current === draftRaw) return;
    if (draftStatus === "none") {
      if (content.current) content.current.value = saved.content;
      if (links.current) links.current.value = saved.links;
    }
    restoredFor.current = draftRaw;
  }, [restorable, saved, draftRaw, draftStatus]);

  function onEdit() {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const value = { content: content.current?.value ?? "", links: links.current?.value ?? "" };
      const unchanged = value.content === defaultContent && value.links === defaultLinks;
      writeDraft(key, unchanged ? null : { ...value, savedAt: Date.now() });
      setDraftStatus(unchanged ? "none" : "saved");
    }, 600);
  }

  function discardDraft() {
    clearTimeout(saveTimer.current);
    writeDraft(key, null);
    if (content.current) content.current.value = defaultContent;
    if (links.current) links.current.value = defaultLinks;
    setDraftStatus("dismissed");
  }

  return (
    <form action={action} onInput={onEdit} className="space-y-3">
      <input type="hidden" name="homeworkId" value={homeworkId} />
      {restorable && draftStatus === "none" && (
        <p className="flex items-center justify-between gap-2 rounded-xl bg-accent-soft px-3 py-2 text-sm text-accent">
          {attemptLabels.draftRestored}
          <button type="button" onClick={discardDraft} className="shrink-0 font-semibold underline">
            {attemptLabels.discardDraft}
          </button>
        </p>
      )}
      <label className="block">
        <span className="mb-1 block text-sm font-medium">{labels.answer}</span>
        <textarea ref={content} name="content" rows={6} defaultValue={defaultContent} className="field resize-y" />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">{labels.links}</span>
        <textarea
          ref={links}
          name="links"
          rows={2}
          defaultValue={defaultLinks}
          placeholder={labels.linksPlaceholder}
          className="field resize-y font-mono text-sm"
        />
      </label>
      {draftStatus === "saved" && <p className="text-xs text-muted">{attemptLabels.draftSaved}</p>}
      {keepFrom && (
        <label className="flex items-start gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-sm">
          <input type="checkbox" name="keepFiles" defaultChecked className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
          <span>
            {fmt(attemptLabels.keepFiles, { n: keepFrom.number })}
            <span className="block text-xs text-muted">{keepFrom.names.join(", ")}</span>
          </span>
        </label>
      )}
      <FileUploader homeworkId={homeworkId} files={files} labels={fileLabels} />
      {state?.error && <p className="rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">{errors[state.error]}</p>}
      {state?.ok && <p className="rounded-xl bg-good-soft px-3 py-2 text-sm text-good">{ok[state.ok]}</p>}
      <button type="submit" disabled={pending} className="btn w-full">
        {pending ? labels.submitting : submitLabel}
      </button>
    </form>
  );
}
