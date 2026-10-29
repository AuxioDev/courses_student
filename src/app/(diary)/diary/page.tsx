import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { getCurrentStudent } from "@/lib/auth";
import { getDiaryDay } from "@/lib/data";
import { addDays, dayKey, formatDayKey, formatTime, isDayKey } from "@/lib/dates";
import { LessonCard } from "@/components/lesson-card";
import { Badge, Card, Empty, Section, Skeleton } from "@/components/ui";
import { ChevronLeft, ChevronRight, TrashIcon } from "@/components/icons";
import { formatScore } from "@/components/status";
import { addNote, deleteNote } from "../../actions";

export const metadata: Metadata = { title: "Diary" };

export default function DiaryPage({ searchParams }: PageProps<"/diary">) {
  return (
    <Suspense fallback={<Skeleton rows={3} />}>
      <DiaryDay searchParams={searchParams} />
    </Suspense>
  );
}

async function DiaryDay({ searchParams }: Pick<PageProps<"/diary">, "searchParams">) {
  const student = await getCurrentStudent();
  const now = new Date();
  const today = dayKey(now, student.timezone);
  const { date } = await searchParams;
  const key = isDayKey(date) ? date : today;
  const { lessons, homeworkDue, marks, notes } = await getDiaryDay(key);

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-2">
        <Link href={`/diary?date=${addDays(key, -1)}`} className="btn-ghost px-2" aria-label="Previous day">
          <ChevronLeft />
        </Link>
        <div className="text-center">
          <h1 className="text-lg font-semibold">{formatDayKey(key)}</h1>
          {key !== today && (
            <Link href="/diary" className="text-xs text-accent">
              Back to today
            </Link>
          )}
        </div>
        <Link href={`/diary?date=${addDays(key, 1)}`} className="btn-ghost px-2" aria-label="Next day">
          <ChevronRight />
        </Link>
      </div>

      <Section title="Lessons">
        {lessons.length === 0 ? (
          <Empty>No lessons on this day.</Empty>
        ) : (
          <div className="space-y-2">
            {lessons.map((lesson) => (
              <LessonCard key={lesson.id} lesson={lesson} timeZone={student.timezone} now={now} />
            ))}
          </div>
        )}
      </Section>

      {homeworkDue.length > 0 && (
        <Section title="Homework due">
          <Card className="divide-y divide-line p-0">
            {homeworkDue.map((hw) => (
              <Link key={hw.id} href={`/homework/${hw.id}`} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="font-medium">{hw.title}</p>
                  <p className="text-xs text-muted">
                    {hw.group.course.title} · {formatTime(hw.dueAt, student.timezone)}
                  </p>
                </div>
                {hw.submissions[0] ? <Badge tone="good">Handed in</Badge> : <Badge tone="accent">To do</Badge>}
              </Link>
            ))}
          </Card>
        </Section>
      )}

      {marks.length > 0 && (
        <Section title="Marks">
          <Card className="divide-y divide-line p-0">
            {marks.map((mark) => (
              <div key={mark.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="font-medium">{mark.group.course.title}</p>
                  <p className="text-xs capitalize text-muted">{mark.type}</p>
                </div>
                <span className="font-mono text-lg font-semibold">{formatScore(mark.value)}</span>
              </div>
            ))}
          </Card>
        </Section>
      )}

      <Section title="My notes">
        {notes.length > 0 && (
          <ul className="mb-2 space-y-2">
            {notes.map((note) => (
              <li key={note.id}>
                <Card className="flex items-start justify-between gap-2 bg-warn-soft/40">
                  <p className="whitespace-pre-wrap text-sm">{note.text}</p>
                  <form action={deleteNote}>
                    <input type="hidden" name="id" value={note.id} />
                    <button type="submit" className="text-muted" aria-label="Delete note">
                      <TrashIcon width={18} height={18} />
                    </button>
                  </form>
                </Card>
              </li>
            ))}
          </ul>
        )}
        <form action={addNote} className="flex gap-2">
          <input type="hidden" name="date" value={key} />
          <input name="text" required placeholder="Write a private note…" className="field min-w-0 flex-1" />
          <button type="submit" className="btn shrink-0">
            Add
          </button>
        </form>
        <p className="mt-1 text-xs text-muted">Only you can see your notes.</p>
      </Section>
    </>
  );
}
