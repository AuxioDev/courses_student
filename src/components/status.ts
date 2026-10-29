import type { AttendanceStatus, LessonStatus } from "@/generated/prisma/enums";
import type { HomeworkState } from "@/lib/data";
import type { Tone } from "./ui";

export const attendanceLabel: Record<AttendanceStatus, { label: string; tone: Tone }> = {
  present: { label: "Present", tone: "good" },
  late: { label: "Late", tone: "warn" },
  absent: { label: "Absent", tone: "bad" },
  excused: { label: "Excused", tone: "neutral" },
};

export const lessonStatusLabel: Record<LessonStatus, { label: string; tone: Tone } | null> = {
  scheduled: null,
  done: null,
  moved: { label: "Moved", tone: "warn" },
  cancelled: { label: "Cancelled", tone: "bad" },
};

export const homeworkStateLabel: Record<HomeworkState, { label: string; tone: Tone }> = {
  todo: { label: "To do", tone: "accent" },
  returned: { label: "Returned", tone: "warn" },
  submitted: { label: "Submitted", tone: "neutral" },
  graded: { label: "Graded", tone: "good" },
  overdue: { label: "Overdue", tone: "bad" },
};

export function formatScore(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
