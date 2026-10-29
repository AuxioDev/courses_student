import { Suspense } from "react";
import type { Metadata } from "next";
import { getCurrentStudent } from "@/lib/auth";
import { getAttendanceByCourse } from "@/lib/data";
import { formatDateTime } from "@/lib/dates";
import { Badge, Empty, PageTitle, Skeleton } from "@/components/ui";
import { attendanceLabel } from "@/components/status";

export const metadata: Metadata = { title: "Attendance" };

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
  const student = await getCurrentStudent();
  const courses = await getAttendanceByCourse();

  return (
    <>
      <PageTitle title="Attendance" subtitle="Late counts as attended; excused lessons are not counted." />
      {courses.length === 0 && <Empty>You are not enrolled in any course yet.</Empty>}
      <div className="space-y-4">
        {courses.map((c) => (
          <details key={c.groupId} className="rounded-2xl border border-line bg-surface">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
              <div>
                <p className="font-semibold">{c.course}</p>
                <p className="text-xs text-muted">
                  {c.groupName} · {c.records.length} recorded
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
                      <p className="text-sm">{formatDateTime(r.lesson.startsAt, student.timezone)}</p>
                      {(r.lesson.topic || r.note) && (
                        <p className="truncate text-xs text-muted">{[r.lesson.topic, r.note].filter(Boolean).join(" · ")}</p>
                      )}
                    </div>
                    <Badge tone={attendanceLabel[r.status].tone}>{attendanceLabel[r.status].label}</Badge>
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
