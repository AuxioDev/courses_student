import Link from "next/link";
import type { LessonWithDetails } from "@/lib/data";
import { formatTime } from "@/lib/dates";
import { attendanceLabel, lessonStatusLabel } from "./status";
import { Badge } from "./ui";
import { VideoIcon } from "./icons";

const JOIN_WINDOW_MS = 15 * 60 * 1000;

export function LessonCard({ lesson, timeZone, now }: { lesson: LessonWithDetails; timeZone: string; now: Date }) {
  const status = lessonStatusLabel[lesson.status];
  const attendance = lesson.attendance[0];
  const cancelled = lesson.status === "cancelled";
  const live =
    !cancelled &&
    lesson.meetingUrl &&
    now.getTime() >= lesson.startsAt.getTime() - JOIN_WINDOW_MS &&
    now < lesson.endsAt;

  return (
    <div className={`flex gap-3 rounded-2xl border border-line bg-surface p-4 ${cancelled ? "opacity-60" : ""}`}>
      <div className="w-12 shrink-0 text-right font-mono text-sm leading-tight">
        <div className={cancelled ? "line-through" : "font-semibold"}>{formatTime(lesson.startsAt, timeZone)}</div>
        <div className="text-muted">{formatTime(lesson.endsAt, timeZone)}</div>
      </div>
      <div className="min-w-0 flex-1 border-l border-line pl-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-semibold">{lesson.group.course.title}</span>
          {status && <Badge tone={status.tone}>{status.label}</Badge>}
          {attendance && (
            <Badge tone={attendanceLabel[attendance.status].tone}>{attendanceLabel[attendance.status].label}</Badge>
          )}
        </div>
        {lesson.topic && <p className="mt-0.5 text-sm">{lesson.topic}</p>}
        <p className="mt-0.5 text-xs text-muted">
          {lesson.group.name} · {lesson.teacher.name}
        </p>
        {lesson.materials && <p className="mt-2 text-sm text-muted">{lesson.materials}</p>}
        {lesson.homework.length > 0 && (
          <ul className="mt-2 space-y-1">
            {lesson.homework.map((hw) => (
              <li key={hw.id}>
                <Link href={`/homework/${hw.id}`} className="text-sm font-medium text-accent">
                  Homework: {hw.title} →
                </Link>
              </li>
            ))}
          </ul>
        )}
        {live && (
          <a href={lesson.meetingUrl!} target="_blank" rel="noreferrer" className="btn mt-3">
            <VideoIcon width={18} height={18} /> Join lesson
          </a>
        )}
      </div>
    </div>
  );
}
