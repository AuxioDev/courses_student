import "server-only";
import { db } from "../db";
import { mapConcurrent, NOTIFY_CONCURRENCY } from "../concurrency";
import { notify } from "./notify";

// A day plus margin: Vercel Hobby may run the job up to an hour late. dedupeKey prevents repeats.
const WINDOW_MS = 26 * 60 * 60 * 1000;

// Reminds every enrolled student who hasn't handed in yet about homework due in
// about the next day. Safe to run more than once: each reminder has a dedupeKey.
export async function sendDeadlineReminders(now = new Date()) {
  const homework = await db.homework.findMany({
    where: {
      dueAt: { gt: now, lte: new Date(now.getTime() + WINDOW_MS) },
      group: { term: { locked: false } },
    },
    select: {
      id: true,
      title: true,
      dueAt: true,
      submissions: { select: { studentId: true } },
      group: {
        select: {
          course: { select: { title: true } },
          enrollments: { where: { status: "active", student: { active: true } }, select: { studentId: true } },
        },
      },
    },
  });

  const due = homework.flatMap((hw) => {
    const handedIn = new Set(hw.submissions.map((s) => s.studentId));
    return hw.group.enrollments
      .filter(({ studentId }) => !handedIn.has(studentId))
      .map(({ studentId }) => ({ hw, studentId }));
  });

  // A few at a time, and one student's failure must not cost everyone after them their reminder.
  const outcomes = await mapConcurrent(due, NOTIFY_CONCURRENCY, ({ hw, studentId }) =>
    notify(
      studentId,
      "deadline",
      { homeworkId: hw.id, homeworkTitle: hw.title, course: hw.group.course.title, dueAt: hw.dueAt.toISOString() },
      // Includes the date, so a deadline the teacher moves gets its own reminder.
      { dedupeKey: `deadline:${hw.id}:${hw.dueAt.toISOString()}` },
    ),
  );
  const sent = outcomes.filter((o) => o.status === "fulfilled" && o.value).length;
  const skipped = outcomes.filter((o) => o.status === "fulfilled" && !o.value).length;
  const failed = outcomes.filter((o) => o.status === "rejected").length;
  if (failed > 0) console.error(`[reminders] ${failed} deadline reminder(s) failed`);
  return { homework: homework.length, sent, skipped, failed };
}
