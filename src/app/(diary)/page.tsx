import { Suspense } from "react";
import Link from "next/link";
import { getCurrentStudent } from "@/lib/auth";
import { getHomeworkList, getLessonsBetween, getRecentMarks } from "@/lib/data";
import { dayKey, dayRange, formatDayKey, relativeDue } from "@/lib/dates";
import { LessonCard } from "@/components/lesson-card";
import { Badge, Card, Empty, PageTitle, Section, Skeleton } from "@/components/ui";
import { formatScore, homeworkStateLabel } from "@/components/status";

const SOON_MS = 3 * 24 * 60 * 60 * 1000;

export default function TodayPage() {
  return (
    <Suspense fallback={<Skeleton rows={4} />}>
      <Today />
    </Suspense>
  );
}

async function Today() {
  const student = await getCurrentStudent();
  const now = new Date();
  const today = dayKey(now, student.timezone);
  const { start, end } = dayRange(today, student.timezone);

  const [lessons, homework, marks] = await Promise.all([
    getLessonsBetween(start, end),
    getHomeworkList(),
    getRecentMarks(5),
  ]);
  const dueSoon = homework.filter(
    (hw) =>
      hw.state === "overdue" ||
      hw.state === "returned" ||
      (hw.state === "todo" && hw.dueAt.getTime() - now.getTime() < SOON_MS),
  );
  const weekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const newMarks = marks.filter((m) => m.createdAt.getTime() > weekAgo);

  return (
    <>
      <PageTitle title={`Hi, ${student.name.split(" ")[0]}`} subtitle={formatDayKey(today)} />

      <Section title="Today's lessons">
        {lessons.length === 0 ? (
          <Empty>No lessons today.</Empty>
        ) : (
          <div className="space-y-2">
            {lessons.map((lesson) => (
              <LessonCard key={lesson.id} lesson={lesson} timeZone={student.timezone} now={now} />
            ))}
          </div>
        )}
      </Section>

      <Section title="Homework due soon" action={<Link href="/homework" className="text-sm text-accent">All</Link>}>
        {dueSoon.length === 0 ? (
          <Empty>Nothing due in the next 3 days.</Empty>
        ) : (
          <ul className="space-y-2">
            {dueSoon.map((hw) => (
              <li key={hw.id}>
                <Link href={`/homework/${hw.id}`} className="block">
                  <Card className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{hw.title}</p>
                      <p className="text-xs text-muted">
                        {hw.group.course.title} · {relativeDue(hw.dueAt, now)}
                      </p>
                    </div>
                    <Badge tone={homeworkStateLabel[hw.state].tone}>{homeworkStateLabel[hw.state].label}</Badge>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="New marks" action={<Link href="/marks" className="text-sm text-accent">All</Link>}>
        {newMarks.length === 0 ? (
          <Empty>No new marks this week.</Empty>
        ) : (
          <Card className="divide-y divide-line p-0">
            {newMarks.map((mark) => (
              <div key={mark.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="font-medium">{mark.group.course.title}</p>
                  <p className="text-xs capitalize text-muted">
                    {mark.type}
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
