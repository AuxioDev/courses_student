import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { getCurrentStudent } from "@/lib/auth";
import { getNotes, getTodos } from "@/lib/data";
import { dayKey, formatDayKey } from "@/lib/dates";
import { getI18n } from "@/i18n";
import { localePath } from "@/i18n/config";
import { Card, Empty, PageTitle, Section, Skeleton } from "@/components/ui";
import { CheckIcon, TrashIcon } from "@/components/icons";
import { addNote, addTodo, deleteNote, deleteTodo, toggleTodo } from "@/app/actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.notes.title };
}

export default function NotesPage() {
  return (
    <Suspense fallback={<Skeleton rows={4} />}>
      <Notes />
    </Suspense>
  );
}

async function Notes() {
  const [{ locale, t }, student] = await Promise.all([getI18n(), getCurrentStudent()]);
  const today = dayKey(new Date(), student.timezone);
  const [todos, notes] = await Promise.all([getTodos(), getNotes()]);

  return (
    <>
      <PageTitle title={t.notes.title} subtitle={t.notes.subtitle} />

      <Section title={t.notes.todos}>
        <form action={addTodo} className="mb-3 flex flex-wrap gap-2">
          <input name="title" required placeholder={t.notes.addTodo} className="field basis-full" />
          <input name="dueAt" type="date" className="field min-w-0 flex-1" aria-label={t.notes.dueDate} />
          <button type="submit" className="btn shrink-0">
            {t.common.add}
          </button>
        </form>
        {todos.length === 0 ? (
          <Empty>{t.notes.noTodos}</Empty>
        ) : (
          <Card className="divide-y divide-line p-0">
            {todos.map((todo) => (
              <div key={todo.id} className="flex items-center gap-3 px-4 py-2.5">
                <form action={toggleTodo}>
                  <input type="hidden" name="id" value={todo.id} />
                  <button
                    type="submit"
                    aria-label={todo.done ? t.notes.markNotDone : t.notes.markDone}
                    className="-m-2.5 flex h-11 w-11 items-center justify-center"
                  >
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-md border ${
                        todo.done ? "border-good bg-good text-white" : "border-line"
                      }`}
                    >
                      {todo.done && <CheckIcon width={16} height={16} strokeWidth={3} />}
                    </span>
                  </button>
                </form>
                <div className={`min-w-0 flex-1 ${todo.done ? "text-muted line-through" : ""}`}>
                  <p className="text-sm">{todo.title}</p>
                  {todo.dueAt && (
                    <p className="text-xs text-muted">
                      {formatDayKey(todo.dueAt.toISOString().slice(0, 10), locale, { month: "short" })}
                    </p>
                  )}
                </div>
                <form action={deleteTodo}>
                  <input type="hidden" name="id" value={todo.id} />
                  <button type="submit" className="icon-btn" aria-label={t.notes.deleteTodo}>
                    <TrashIcon width={18} height={18} />
                  </button>
                </form>
              </div>
            ))}
          </Card>
        )}
      </Section>

      <Section title={t.notes.notes}>
        <form action={addNote} className="mb-3 space-y-2">
          <input type="hidden" name="date" value={today} />
          <textarea name="text" required rows={3} placeholder={t.notes.notePlaceholder} className="field resize-y" />
          <button type="submit" className="btn">
            {t.notes.saveNote}
          </button>
        </form>
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
                      <Link href={localePath(locale, `/diary?date=${key}`)} className="text-xs font-medium text-accent">
                        {formatDayKey(key, locale, { month: "short" })}
                        {note.lesson?.group.course.title && ` · ${note.lesson.group.course.title}`}
                      </Link>
                      <p className="mt-1 whitespace-pre-wrap text-sm">{note.text}</p>
                    </div>
                    <form action={deleteNote}>
                      <input type="hidden" name="id" value={note.id} />
                      <button type="submit" className="icon-btn" aria-label={t.diary.deleteNote}>
                        <TrashIcon width={18} height={18} />
                      </button>
                    </form>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </>
  );
}
