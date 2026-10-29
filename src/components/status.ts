import type { AttendanceStatus, LessonStatus } from "@/generated/prisma/enums";
import type { HomeworkState } from "@/lib/data";
import type { Tone } from "./ui";

// Labels live in the dictionaries (t.attendance.status, t.lesson.status, t.homework.state).

export const attendanceTone: Record<AttendanceStatus, Tone> = {
  present: "good",
  late: "warn",
  absent: "bad",
  excused: "neutral",
};

export const lessonStatusTone: Partial<Record<LessonStatus, Tone>> = {
  moved: "warn",
  cancelled: "bad",
};

export const homeworkStateTone: Record<HomeworkState, Tone> = {
  todo: "accent",
  returned: "warn",
  submitted: "neutral",
  graded: "good",
  overdue: "bad",
};

export function formatScore(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
