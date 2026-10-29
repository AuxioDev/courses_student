import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { getCurrentStudent } from "@/lib/auth";
import { getDiaryDay, homeworkState } from "@/lib/data";
import { addDays, dayKey, formatDayKey, formatTime, isDayKey } from "@/lib/dates";
import { getI18n } from "@/i18n";
import { localePath } from "@/i18n/config";
import { LessonCard } from "@/components/lesson-card";
import { Badge, Card, Empty, Section, Skeleton } from "@/components/ui";
import { ChevronLeft, ChevronRight, TrashIcon } from "@/components/icons";
import { formatScore, homeworkStateTone } from "@/components/status";
import { addNote, deleteNote } from "@/app/actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.diary.title };
}

export default function DiaryPage({ searchParams }: PageProps<"/[lang]/diary">) {
  return (
    <Suspense fallback={<Skeleton rows={3} />}>
      <DiaryDay searchParams={searchParams} />
    </Suspense>
  );
}

async function DiaryDay({ searchParams }: Pick<PageProps<"/[lang]/diary">, "searchParams">) {
  const [{ locale, t }, student] = await Promise.all([getI18n(), getCurrentStudent()]);
  const now = new Date();
  const today = dayKey(now, student.timezone);
  const { date } = await searchParams;
  const key = isDayKey(date) ? date : today;
  const { lessons, homeworkDue, marks, notes } = await getDiaryDay(key);
  const dayHref = (k: string) => localePath(locale, `/diary?date=${k}`);

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-2">
        <Link href={dayHref(addDays(key, -1))} className="btn-ghost px-2" aria-label={t.diary.previousDay}>
          <ChevronLeft />
        </Link>
        <div className="text-center">
          <h1 className="text-lg font-semibold first-letter:uppercase">{formatDayKey(key, locale)}</h1>
          {key !== today && (
            <Link href={localePath(locale, "/diary")} className="text-xs text-accent">
              {t.diary.backToToday}
            </Link>
          )}
        </div>
        <Link href={dayHref(addDays(key, 1))} className="btn-ghost px-2" aria-label={t.diary.nextDay}>
          <ChevronRight />
        </Link>
      </div>

      <Section title={t.diary.lessons}>
        {lessons.length === 0 ? (
          <Empty>{t.diary.noLessons}</Empty>
        ) : (
          <div className="space-y-2">
            {lessons.map((lesson) => (
              <LessonCard key={lesson.id} lesson={lesson} timeZone={student.timezone} now={now} />
            ))}
          </div>
        )}
      </Section>

      {homeworkDue.length > 0 && (
        <Section title={t.diary.homeworkDue}>
          <Card className="divide-y divide-line p-0">
            {homeworkDue.map((hw) => {
              const state = homeworkState(hw.dueAt, hw.submissions[0]?.status, now);
              return (
                <Link
                  key={hw.id}
                  href={localePath(locale, `/homework/${hw.id}`)}
                  className="flex items-center justify-between px-4 py-3"
                >
                  <div>
                    <p className="font-medium">{hw.title}</p>
                    <p className="text-xs text-muted">
                      {hw.group.course.title} · {formatTime(hw.dueAt, student.timezone)}
                    </p>
                  </div>
                  <Badge tone={homeworkStateTone[state]}>{t.homework.state[state]}</Badge>
                </Link>
              );
            })}
          </Card>
        </Section>
      )}

      {marks.length > 0 && (
        <Section title={t.diary.marks}>
          <Card className="divide-y divide-line p-0">
            {marks.map((mark) => (
              <div key={mark.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="font-medium">{mark.group.course.title}</p>
                  <p className="text-xs text-muted">{t.marks.type[mark.type]}</p>
                </div>
                <span className="font-mono text-lg font-semibold">{formatScore(mark.value)}</span>
              </div>
            ))}
          </Card>
        </Section>
      )}

      <Section title={t.diary.myNotes}>
        {notes.length > 0 && (
          <ul className="mb-2 space-y-2">
            {notes.map((note) => (
              <li key={note.id}>
                <Card className="flex items-start justify-between gap-2 bg-warn-soft/40">
                  <p className="whitespace-pre-wrap text-sm">{note.text}</p>
                  <form action={deleteNote}>
                    <input type="hidden" name="id" value={note.id} />
                    <button type="submit" className="text-muted" aria-label={t.diary.deleteNote}>
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
          <input name="text" required placeholder={t.diary.notePlaceholder} className="field min-w-0 flex-1" />
          <button type="submit" className="btn shrink-0">
            {t.common.add}
          </button>
        </form>
        <p className="mt-1 text-xs text-muted">{t.diary.notesPrivate}</p>
      </Section>
    </>
  );
}
