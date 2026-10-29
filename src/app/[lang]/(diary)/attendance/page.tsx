import { Suspense } from "react";
import type { Metadata } from "next";
import { getCurrentStudent } from "@/lib/auth";
import { getAttendanceByCourse } from "@/lib/data";
import { formatDateTime } from "@/lib/dates";
import { fmt, getI18n } from "@/i18n";
import { Badge, Empty, PageTitle, Skeleton } from "@/components/ui";
import { attendanceTone } from "@/components/status";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.attendance.title };
}

export default function AttendancePage() {
  return (
    <Suspense fallback={<Skeleton rows={3} />}>
      <Attendance />
    </Suspense>
  );
}

function rateTone(rate: number) {
  if (rate >= 0.9) return "text-good";
  if (rate >= 0.75) return "text-warn";
  return "text-bad";
}

async function Attendance() {
  const [{ locale, t }, student, courses] = await Promise.all([getI18n(), getCurrentStudent(), getAttendanceByCourse()]);

  return (
    <>
      <PageTitle title={t.attendance.title} subtitle={t.attendance.subtitle} />
      {courses.length === 0 && <Empty>{t.common.notEnrolled}</Empty>}
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
              <span className={`font-mono text-2xl font-semibold ${c.rate == null ? "" : rateTone(c.rate)}`}>
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
