"use client";

import { useActionState, useState } from "react";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { addNote, addTodo, type FormState } from "@/app/actions";
import { CharCounter, FormMessage } from "@/components/form-kit";
import { SubmitButton } from "@/components/submit-button";

const NOTE_MAX = 5_000;
const TODO_MAX = 300;

type Texts = { errors: Dictionary["errors"]; counter: Dictionary["form"] };

// Adding a to-do: the title is kept if the server says no, and emptied once it is saved.
export function AddTodoForm({
  placeholder,
  dueLabel,
  submit,
  errors,
  counter,
}: Texts & { placeholder: string; dueLabel: string; submit: string }) {
  const [title, setTitle] = useState("");
  const [state, action] = useActionState(async (previous: FormState, formData: FormData) => {
    const result = await addTodo(previous, formData);
    if (result?.ok) setTitle("");
    return result;
  }, undefined);
  return (
    <form action={action} className="mb-3 flex flex-wrap gap-2">
      <div className="basis-full">
        <input
          name="title"
          required
          maxLength={TODO_MAX + 50}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          aria-invalid={state?.error ? true : undefined}
          className="field"
        />
        <CharCounter length={title.length} max={TODO_MAX} labels={counter} />
      </div>
      <input name="dueAt" type="date" className="field min-w-0 flex-1" aria-label={dueLabel} />
      <SubmitButton className="btn shrink-0">{submit}</SubmitButton>
      {state?.error && (
        <div className="basis-full">
          <FormMessage kind="error">{errors[state.error]}</FormMessage>
        </div>
      )}
    </form>
  );
}

// Adding a note for a day: a roomy box on the Notes page (`multiline`), a single line in the Diary.
export function AddNoteForm({
  date,
  multiline,
  placeholder,
  submit,
  errors,
  counter,
}: Texts & { date: string; multiline?: boolean; placeholder: string; submit: string }) {
  const [text, setText] = useState("");
  const [state, action] = useActionState(async (previous: FormState, formData: FormData) => {
    const result = await addNote(previous, formData);
    if (result?.ok) setText("");
    return result;
  }, undefined);
  const shared = {
    name: "text",
    required: true,
    value: text,
    placeholder,
    "aria-label": placeholder,
    "aria-invalid": state?.error ? (true as const) : undefined,
  };
  return (
    <form action={action} className={multiline ? "mb-3 space-y-2" : "space-y-1"}>
      <input type="hidden" name="date" value={date} />
      <div className={multiline ? "" : "flex gap-2"}>
        {multiline ? (
          <textarea {...shared} rows={3} onChange={(event) => setText(event.target.value)} className="field resize-y" />
        ) : (
          <input {...shared} onChange={(event) => setText(event.target.value)} className="field min-w-0 flex-1" />
        )}
        {!multiline && <SubmitButton className="btn shrink-0">{submit}</SubmitButton>}
      </div>
      <CharCounter length={text.length} max={NOTE_MAX} labels={counter} />
      {state?.error && <FormMessage kind="error">{errors[state.error]}</FormMessage>}
      {multiline && <SubmitButton className="btn">{submit}</SubmitButton>}
    </form>
  );
}
