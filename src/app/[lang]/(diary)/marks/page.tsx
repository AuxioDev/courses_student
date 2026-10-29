import { Suspense } from "react";
import type { Metadata } from "next";
import { getCurrentStudent } from "@/lib/auth";
import { getMarksByCourse } from "@/lib/data";
import { formatDayKey, dayKey } from "@/lib/dates";
import { fmt, getI18n, plural } from "@/i18n";
import { Card, Empty, PageTitle, Skeleton } from "@/components/ui";
import { formatScore } from "@/components/status";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.marks.title };
}

export default function MarksPage() {
  return (
    <Suspense fallback={<Skeleton rows={3} />}>
      <Marks />
    </Suspense>
  );
}

async function Marks() {
  const [{ locale, t }, student, courses] = await Promise.all([getI18n(), getCurrentStudent(), getMarksByCourse()]);

  return (
    <>
      <PageTitle title={t.marks.title} subtitle={t.marks.subtitle} />
      {courses.length === 0 && <Empty>{t.common.notEnrolled}</Empty>}
      <div className="space-y-4">
        {courses.map((c) => (
          <details key={c.groupId} className="group rounded-2xl border border-line bg-surface" open={courses.length === 1}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="font-semibold">{c.course}</p>
                <p className="text-xs text-muted">
                  {c.groupName} · {c.term} · {plural(locale, t.marks.count, c.marks.length)}
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono text-2xl font-semibold">{c.average == null ? "—" : formatScore(c.average)}</p>
                <p className="text-[11px] text-muted">{t.marks.average}</p>
              </div>
            </summary>
            <div className="border-t border-line">
              {c.finalGrade != null && (
                <div className="flex items-center justify-between bg-accent-soft px-4 py-3 text-accent">
                  <span className="text-sm font-semibold">{t.marks.finalGrade}</span>
                  <span className="font-mono text-xl font-bold">{formatScore(c.finalGrade)}</span>
                </div>
              )}
              {c.marks.length === 0 ? (
                <p className="px-4 py-3 text-sm text-muted">{t.marks.noMarks}</p>
              ) : (
                <ul className="divide-y divide-line">
                  {c.marks.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {t.marks.type[m.type]}
                          {m.weight !== 1 && <span className="ml-1 text-xs font-normal text-muted">×{m.weight}</span>}
                        </p>
                        <p className="truncate text-xs text-muted">
                          {formatDayKey(dayKey(m.createdAt, student.timezone), locale, { weekday: undefined, month: "short" })}
                          {(m.homework?.title ?? m.lesson?.topic) && ` · ${m.homework?.title ?? m.lesson?.topic}`}
                          {m.comment && ` · ${m.comment}`}
                        </p>
                      </div>
                      <span className="font-mono text-lg font-semibold">{formatScore(m.value)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </details>
        ))}
      </div>
      {courses.length > 0 && <Card className="mt-4 text-xs text-muted">{fmt(t.marks.gradingScale, { scale: courses[0].gradingScale })}</Card>}
    </>
  );
}
