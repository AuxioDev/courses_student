import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { getCurrentStudent } from "@/lib/auth";
import { getLessonsBetween, type LessonWithDetails } from "@/lib/data";
import {
  addDays,
  addMonths,
  dayKey,
  formatDayKey,
  formatTime,
  isDayKey,
  startOfDay,
  startOfMonth,
  startOfWeek,
  weekdayNames,
  type DayKey,
} from "@/lib/dates";
import { getI18n } from "@/i18n";
import { localePath, type Locale } from "@/i18n/config";
import { LessonCard } from "@/components/lesson-card";
import { Empty, Skeleton } from "@/components/ui";
import { ChevronLeft, ChevronRight } from "@/components/icons";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.schedule.title };
}

export default function SchedulePage({ searchParams }: PageProps<"/[lang]/schedule">) {
  return (
    <Suspense fallback={<Skeleton rows={5} />}>
      <Schedule searchParams={searchParams} />
    </Suspense>
  );
}

function groupByDay(lessons: LessonWithDetails[], timeZone: string) {
  const map = new Map<DayKey, LessonWithDetails[]>();
  for (const lesson of lessons) {
    const key = dayKey(lesson.startsAt, timeZone);
    map.set(key, [...(map.get(key) ?? []), lesson]);
  }
  return map;
}

async function Schedule({ searchParams }: Pick<PageProps<"/[lang]/schedule">, "searchParams">) {
  const [{ locale, t }, student] = await Promise.all([getI18n(), getCurrentStudent()]);
  const tz = student.timezone;
  const href = (v: string, d: string) => localePath(locale, `/schedule?view=${v}&date=${d}`);
  const now = new Date();
  const today = dayKey(now, tz);
  const params = await searchParams;
  const view = params.view === "month" ? "month" : "week";
  const anchor = isDayKey(params.date) ? params.date : today;

  const first = view === "week" ? startOfWeek(anchor) : startOfWeek(startOfMonth(anchor));
  const last = view === "week" ? addDays(first, 7) : addDays(startOfWeek(addMonths(startOfMonth(anchor), 1)), 7);
  const lessons = await getLessonsBetween(startOfDay(first, tz), startOfDay(last, tz));
  const byDay = groupByDay(lessons, tz);

  const prev = view === "week" ? addDays(anchor, -7) : addMonths(startOfMonth(anchor), -1);
  const next = view === "week" ? addDays(anchor, 7) : addMonths(startOfMonth(anchor), 1);
  const title =
    view === "week"
      ? `${formatDayKey(first, locale, { weekday: undefined, month: "short" })} – ${formatDayKey(addDays(first, 6), locale, {
          weekday: undefined,
          month: "short",
        })}`
      : formatDayKey(startOfMonth(anchor), locale, { weekday: undefined, day: undefined, year: "numeric" });

  return (
    <>
      <div className="mb-4 flex rounded-xl border border-line bg-surface p-1 text-sm font-medium">
        {(["week", "month"] as const).map((v) => (
          <Link
            key={v}
            href={href(v, anchor)}
            className={`flex-1 rounded-lg py-1.5 text-center ${view === v ? "bg-accent text-accent-ink" : "text-muted"}`}
          >
            {t.schedule[v]}
          </Link>
        ))}
      </div>

      <div className="mb-4 flex items-center justify-between">
        <Link href={href(view, prev)} className="btn-ghost px-2" aria-label={t.common.previous}>
          <ChevronLeft />
        </Link>
        <h1 className="text-lg font-semibold first-letter:uppercase">{title}</h1>
        <Link href={href(view, next)} className="btn-ghost px-2" aria-label={t.common.next}>
          <ChevronRight />
        </Link>
      </div>

      {view === "week" ? (
        <div className="space-y-5">
          {Array.from({ length: 7 }, (_, i) => addDays(first, i)).map((key) => {
            const dayLessons = byDay.get(key) ?? [];
            return (
              <section key={key}>
                <h2 className={`mb-2 text-sm font-semibold first-letter:uppercase ${key === today ? "text-accent" : "text-muted"}`}>
                  {formatDayKey(key, locale, { month: "short" })}
                  {key === today && ` · ${t.schedule.today}`}
                </h2>
                {dayLessons.length === 0 ? (
                  <p className="text-sm text-muted">—</p>
                ) : (
                  <div className="space-y-2">
                    {dayLessons.map((lesson) => (
                      <LessonCard key={lesson.id} lesson={lesson} timeZone={tz} now={now} />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <MonthGrid first={first} last={last} month={anchor.slice(0, 7)} today={today} byDay={byDay} tz={tz} locale={locale} />
      )}

      {view === "month" && lessons.length === 0 && <Empty>{t.schedule.noLessonsMonth}</Empty>}
    </>
  );
}

function MonthGrid({
  first,
  last,
  month,
  today,
  byDay,
  tz,
  locale,
}: {
  first: DayKey;
  last: DayKey;
  month: string;
  today: DayKey;
  byDay: Map<DayKey, LessonWithDetails[]>;
  tz: string;
  locale: Locale;
}) {
  const days: DayKey[] = [];
  for (let key = first; key < last; key = addDays(key, 1)) days.push(key);
  return (
    <div className="mb-4 overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="grid grid-cols-7 border-b border-line text-center text-[11px] font-semibold uppercase text-muted">
        {weekdayNames(locale).map((d) => (
          <div key={d} className="py-2">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((key) => {
          const dayLessons = byDay.get(key) ?? [];
          const inMonth = key.startsWith(month);
          return (
            <Link
              key={key}
              href={localePath(locale, `/diary?date=${key}`)}
              className={`min-h-16 border-b border-r border-line p-1 text-xs ${inMonth ? "" : "bg-surface-2/60 text-muted"}`}
            >
              <span
                className={`inline-flex h-5 w-5 items-center justify-center rounded-full ${
                  key === today ? "bg-accent font-bold text-accent-ink" : ""
                }`}
              >
                {Number(key.slice(8))}
              </span>
              <div className="mt-0.5 space-y-0.5">
                {dayLessons.slice(0, 3).map((lesson) => (
                  <div
                    key={lesson.id}
                    className={`truncate rounded px-0.5 font-mono text-[10px] leading-4 sm:px-1 sm:font-sans ${
                      lesson.status === "cancelled"
                        ? "bg-bad-soft text-bad line-through"
                        : lesson.status === "moved"
                          ? "bg-warn-soft text-warn"
                          : "bg-accent-soft text-accent"
                    }`}
                    title={`${formatTime(lesson.startsAt, tz)} ${lesson.group.course.title}`}
                  >
                    {formatTime(lesson.startsAt, tz)}
                    <span className="hidden sm:inline"> {lesson.group.course.title}</span>
                  </div>
                ))}
                {dayLessons.length > 3 && <div className="text-[10px] text-muted">+{dayLessons.length - 3}</div>}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
