import { Suspense } from "react";
import Link from "next/link";
import { getCurrentStudent } from "@/lib/auth";
import { getAttendanceAlerts, getHomeworkList, getLessonsBetween, getRecentMarks } from "@/lib/data";
import { AttendanceAlert } from "@/components/attendance-alert";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { dayKey, dayRange, formatDayKey, relativeDue } from "@/lib/dates";
import { fmt, getI18n } from "@/i18n";
import { localePath } from "@/i18n/config";
import { LessonCard } from "@/components/lesson-card";
import { Badge, Card, Empty, PageTitle, Section, Skeleton } from "@/components/ui";
import { formatScore, homeworkStateTone } from "@/components/status";

const SOON_MS = 3 * 24 * 60 * 60 * 1000;

export default function TodayPage() {
  return (
    <Suspense fallback={<Skeleton rows={4} />}>
      <Today />
    </Suspense>
  );
}

async function Today() {
  const [{ locale, t }, student] = await Promise.all([getI18n(), getCurrentStudent()]);
  const now = new Date();
  const today = dayKey(now, student.timezone);
  const { start, end } = dayRange(today, student.timezone);

  const [lessons, homework, marks, attendance] = await Promise.all([
    getLessonsBetween(start, end),
    getHomeworkList(),
    getRecentMarks(5),
    getAttendanceAlerts(),
  ]);
  const dueSoon = homework.filter(
    (hw) =>
      hw.state === "overdue" ||
      hw.state === "returned" ||
      (hw.state === "todo" && hw.dueAt.getTime() - now.getTime() < SOON_MS),
  );
  const weekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const newMarks = marks.filter((m) => m.createdAt.getTime() > weekAgo);
  const allLink = (path: string) => (
    <Link href={localePath(locale, path)} className="text-sm text-accent">
      {t.common.all}
    </Link>
  );

  return (
    <>
      <PageTitle title={fmt(t.today.greeting, { name: student.name.split(" ")[0] })} subtitle={formatDayKey(today, locale)} />
      <InstallPrompt mode="banner" labels={t.pwa} />

      {attendance && attendance.alerts.length > 0 && (
        <Section
          title={t.attendance.alertsTitle}
          action={
            <Link href={localePath(locale, "/attendance")} className="text-sm text-accent">
              {t.common.all}
            </Link>
          }
        >
          <div className="space-y-2">
            {attendance.alerts.map((c) => (
              <AttendanceAlert
                key={c.groupId}
                course={c.course}
                rate={c.rate!}
                level={c.level}
                settings={attendance.settings}
                labels={t.attendance}
              />
            ))}
          </div>
        </Section>
      )}

      <Section title={t.today.lessons}>
        {lessons.length === 0 ? (
          <Empty>{t.today.noLessons}</Empty>
        ) : (
          <div className="space-y-2">
            {lessons.map((lesson) => (
              <LessonCard key={lesson.id} lesson={lesson} timeZone={student.timezone} now={now} />
            ))}
          </div>
        )}
      </Section>

      <Section title={t.today.dueSoon} action={allLink("/homework")}>
        {dueSoon.length === 0 ? (
          <Empty>{t.today.nothingDue}</Empty>
        ) : (
          <ul className="space-y-2">
            {dueSoon.map((hw) => (
              <li key={hw.id}>
                <Link href={localePath(locale, `/homework/${hw.id}`)} className="block">
                  <Card className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{hw.title}</p>
                      <p className="text-xs text-muted">
                        {hw.group.course.title} · {relativeDue(hw.dueAt, now, t.homework.dueRelative)}
                      </p>
                    </div>
                    <Badge tone={homeworkStateTone[hw.state]}>{t.homework.state[hw.state]}</Badge>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={t.today.newMarks} action={allLink("/marks")}>
        {newMarks.length === 0 ? (
          <Empty>{t.today.noNewMarks}</Empty>
        ) : (
          <Card className="divide-y divide-line p-0">
            {newMarks.map((mark) => (
              <div key={mark.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="font-medium">{mark.group.course.title}</p>
                  <p className="text-xs text-muted">
                    {t.marks.type[mark.type]}
                    {mark.comment ? ` · ${mark.comment}` : ""}
                  </p>
                </div>
                <span className="font-mono text-lg font-semibold">{formatScore(mark.value)}</span>
              </div>
            ))}
          </Card>
        )}
      </Section>
    </>
  );
}
