import { Suspense } from "react";
import type { Metadata } from "next";
import { getCurrentStudent } from "@/lib/auth";
import { getAttendanceByCourse, resolveTerm } from "@/lib/data";
import { formatDateTime } from "@/lib/dates";
import { needsAttention } from "@/lib/grading";
import { fmt, getI18n } from "@/i18n";
import { Badge, Empty, PageTitle, Skeleton } from "@/components/ui";
import { attendanceTone } from "@/components/status";
import { TermSwitcher } from "@/components/term-switcher";
import { AttendanceAlert } from "@/components/attendance-alert";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.attendance.title };
}

const levelText = { ok: "text-good", warn: "text-warn", risk: "text-bad" } as const;

export default function AttendancePage({ searchParams }: PageProps<"/[lang]/attendance">) {
  return (
    <Suspense fallback={<Skeleton rows={3} />}>
      <Attendance searchParams={searchParams} />
    </Suspense>
  );
}

async function Attendance({ searchParams }: Pick<PageProps<"/[lang]/attendance">, "searchParams">) {
  const [{ locale, t }, student, params] = await Promise.all([getI18n(), getCurrentStudent(), searchParams]);
  const { terms, term } = await resolveTerm(params.term);
  if (!term) {
    return (
      <>
        <PageTitle title={t.attendance.title} />
        <Empty>{t.common.notEnrolled}</Empty>
      </>
    );
  }
  const { courses, settings } = await getAttendanceByCourse(term.id);
  const alerts = courses.filter(needsAttention);

  return (
    <>
      <PageTitle title={t.attendance.title} subtitle={t.attendance.subtitle} />
      <TermSwitcher
        terms={terms}
        selected={term.id}
        path="/attendance"
        locale={locale}
        label={t.marks.term}
        currentLabel={t.marks.currentTerm}
      />
      {alerts.length > 0 && (
        <div className="mb-4 space-y-2">
          {alerts.map((c) => (
            <AttendanceAlert key={c.groupId} course={c.course} rate={c.rate!} level={c.level} settings={settings} labels={t.attendance} />
          ))}
        </div>
      )}
      {courses.length === 0 && <Empty>{t.marks.noCourses}</Empty>}
      <div className="space-y-4">
        {courses.map((c) => (
          <details key={c.groupId} className="rounded-2xl border border-line bg-surface">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
              <div>
                <p className="font-semibold">{c.course}</p>
                <p className="text-xs text-muted">
                  {c.groupName} · {fmt(t.attendance.recorded, { n: c.records.length })}
                </p>
              </div>
              <span className={`font-mono text-2xl font-semibold ${c.rate == null ? "" : levelText[c.level]}`}>
                {c.rate == null ? "—" : `${Math.round(c.rate * 100)}%`}
              </span>
            </summary>
            {c.records.length > 0 && (
              <ul className="divide-y divide-line border-t border-line">
                {c.records.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm">{formatDateTime(r.lesson.startsAt, student.timezone, locale)}</p>
                      {(r.lesson.topic || r.note) && (
                        <p className="truncate text-xs text-muted">{[r.lesson.topic, r.note].filter(Boolean).join(" · ")}</p>
                      )}
                    </div>
                    <Badge tone={attendanceTone[r.status]}>{t.attendance.status[r.status]}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </details>
        ))}
      </div>
    </>
  );
}
