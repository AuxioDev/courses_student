import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { getCurrentStudent } from "@/lib/auth";
import { getNotes, getTodos } from "@/lib/data";
import { dayKey, formatDayKey } from "@/lib/dates";
import { Card, Empty, PageTitle, Section, Skeleton } from "@/components/ui";
import { CheckIcon, TrashIcon } from "@/components/icons";
import { addNote, addTodo, deleteNote, deleteTodo, toggleTodo } from "../../actions";

export const metadata: Metadata = { title: "Notes & to-dos" };

export default function NotesPage() {
  return (
    <Suspense fallback={<Skeleton rows={4} />}>
      <Notes />
    </Suspense>
  );
}

async function Notes() {
  const student = await getCurrentStudent();
  const today = dayKey(new Date(), student.timezone);
  const [todos, notes] = await Promise.all([getTodos(), getNotes()]);

  return (
    <>
      <PageTitle title="Notes & to-dos" subtitle="Private — teachers can't see these." />

      <Section title="To-dos">
        <form action={addTodo} className="mb-3 flex flex-wrap gap-2">
          <input name="title" required placeholder="Add a to-do…" className="field basis-full" />
          <input name="dueAt" type="date" className="field min-w-0 flex-1" aria-label="Due date (optional)" />
          <button type="submit" className="btn shrink-0">
            Add
          </button>
        </form>
        {todos.length === 0 ? (
          <Empty>No to-dos.</Empty>
        ) : (
          <Card className="divide-y divide-line p-0">
            {todos.map((todo) => (
              <div key={todo.id} className="flex items-center gap-3 px-4 py-2.5">
                <form action={toggleTodo}>
                  <input type="hidden" name="id" value={todo.id} />
                  <button
                    type="submit"
                    aria-label={todo.done ? "Mark as not done" : "Mark as done"}
                    className={`flex h-6 w-6 items-center justify-center rounded-md border ${
                      todo.done ? "border-good bg-good text-white" : "border-line"
                    }`}
                  >
                    {todo.done && <CheckIcon width={16} height={16} strokeWidth={3} />}
                  </button>
                </form>
                <div className={`min-w-0 flex-1 ${todo.done ? "text-muted line-through" : ""}`}>
                  <p className="text-sm">{todo.title}</p>
                  {todo.dueAt && (
                    <p className="text-xs text-muted">
                      {formatDayKey(todo.dueAt.toISOString().slice(0, 10), { month: "short" })}
                    </p>
                  )}
                </div>
                <form action={deleteTodo}>
                  <input type="hidden" name="id" value={todo.id} />
                  <button type="submit" className="text-muted" aria-label="Delete to-do">
                    <TrashIcon width={18} height={18} />
                  </button>
                </form>
              </div>
            ))}
          </Card>
        )}
      </Section>

      <Section title="Notes">
        <form action={addNote} className="mb-3 space-y-2">
          <input type="hidden" name="date" value={today} />
          <textarea name="text" required rows={3} placeholder="Write a note for today…" className="field resize-y" />
          <button type="submit" className="btn">
            Save note
          </button>
        </form>
        {notes.length === 0 ? (
          <Empty>No notes yet. You can also add notes to any day in the Diary.</Empty>
        ) : (
          <ul className="space-y-2">
            {notes.map((note) => {
              const key = note.date.toISOString().slice(0, 10);
              return (
                <li key={note.id}>
                  <Card className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link href={`/diary?date=${key}`} className="text-xs font-medium text-accent">
                        {formatDayKey(key, { month: "short" })}
                        {note.lesson?.group.course.title && ` · ${note.lesson.group.course.title}`}
                      </Link>
                      <p className="mt-1 whitespace-pre-wrap text-sm">{note.text}</p>
                    </div>
                    <form action={deleteNote}>
                      <input type="hidden" name="id" value={note.id} />
                      <button type="submit" className="text-muted" aria-label="Delete note">
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
