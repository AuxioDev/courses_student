import Link from "next/link";
import type { Metadata } from "next";
import { getCurrentStudent } from "@/lib/auth";
import { getNotes, getTodos } from "@/lib/data";
import { dayKey, formatDayKey } from "@/lib/dates";
import { getI18n } from "@/i18n";
import { localePath } from "@/i18n/config";
import { Card, Empty, PageTitle, Section } from "@/components/ui";
import { CheckIcon, TrashIcon } from "@/components/icons";
import { deleteNote, deleteTodo, toggleTodo } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
import { ConfirmForm } from "@/components/confirm-dialog";
import { AddNoteForm, AddTodoForm } from "@/components/note-forms";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.notes.title };
}

// Data is ready in tens of milliseconds; waiting for it beats flashing a skeleton
// (React holds streamed sections back ~300 ms, which delayed the real content).
export const instant = false;

export default function NotesPage() {
  return <Notes />;
}

async function Notes() {
  const [{ locale, t }, student] = await Promise.all([getI18n(), getCurrentStudent()]);
  const today = dayKey(new Date(), student.timezone);
  const [todos, notes] = await Promise.all([getTodos(), getNotes()]);

  return (
    <>
      <PageTitle title={t.notes.title} subtitle={t.notes.subtitle} />

      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-8">
        <Section title={t.notes.todos}>
          <AddTodoForm
            placeholder={t.notes.addTodo}
            dueLabel={t.notes.dueDate}
            submit={t.common.add}
            errors={t.errors}
            counter={t.form}
          />
          {todos.length === 0 ? (
            <Empty>{t.notes.noTodos}</Empty>
          ) : (
            <Card className="divide-y divide-line p-0">
              {todos.map((todo) => (
                <div key={todo.id} className="flex items-center gap-3 px-4 py-2.5">
                  <form action={toggleTodo}>
                    <input type="hidden" name="id" value={todo.id} />
                    <SubmitButton
                      aria-label={todo.done ? t.notes.markNotDone : t.notes.markDone}
                      className="-m-2.5 flex h-11 w-11 items-center justify-center"
                    >
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-md border ${
                          todo.done ? "border-good bg-good text-bg" : "border-line"
                        }`}
                      >
                        {todo.done && <CheckIcon width={16} height={16} strokeWidth={3} />}
                      </span>
                    </SubmitButton>
                  </form>
                  <div className={`min-w-0 flex-1 ${todo.done ? "text-muted line-through" : ""}`}>
                    <p className="text-sm">{todo.title}</p>
                    {todo.dueAt && (
                      <p className="text-xs text-muted">
                        {formatDayKey(todo.dueAt.toISOString().slice(0, 10), locale, { month: "short" })}
                      </p>
                    )}
                  </div>
                  <ConfirmForm action={deleteTodo} message={t.notes.deleteTodoConfirm} labels={t.dialog}>
                    <input type="hidden" name="id" value={todo.id} />
                    <SubmitButton className="icon-btn" aria-label={t.notes.deleteTodo}>
                      <TrashIcon width={18} height={18} />
                    </SubmitButton>
                  </ConfirmForm>
                </div>
              ))}
            </Card>
          )}
        </Section>

        <Section title={t.notes.notes}>
          <AddNoteForm
            multiline
            date={today}
            placeholder={t.notes.notePlaceholder}
            submit={t.notes.saveNote}
            errors={t.errors}
            counter={t.form}
          />
          {notes.length === 0 ? (
            <Empty>{t.notes.noNotes}</Empty>
          ) : (
            <ul className="space-y-2">
              {notes.map((note) => {
                const key = note.date.toISOString().slice(0, 10);
                return (
                  <li key={note.id}>
                    <Card className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link
                          href={localePath(locale, `/diary?date=${key}`)}
                          className="text-xs font-medium text-accent"
                        >
                          {formatDayKey(key, locale, { month: "short" })}
                          {note.lesson?.group.course.title && ` · ${note.lesson.group.course.title}`}
                        </Link>
                        <p className="mt-1 whitespace-pre-wrap text-sm">{note.text}</p>
                      </div>
                      <ConfirmForm action={deleteNote} message={t.notes.deleteNoteConfirm} labels={t.dialog}>
                        <input type="hidden" name="id" value={note.id} />
                        <SubmitButton className="icon-btn" aria-label={t.diary.deleteNote}>
                          <TrashIcon width={18} height={18} />
                        </SubmitButton>
                      </ConfirmForm>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}
