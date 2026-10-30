import "server-only";
import { db } from "../db";
import { notify } from "./notify";

const WINDOW_MS = 24 * 60 * 60 * 1000;

// Reminds every enrolled student who hasn't handed in yet about homework due in
// the next 24 hours. Safe to run more than once: each reminder has a dedupeKey.
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

  let sent = 0;
  let skipped = 0;
  for (const hw of homework) {
    const handedIn = new Set(hw.submissions.map((s) => s.studentId));
    for (const { studentId } of hw.group.enrollments) {
      if (handedIn.has(studentId)) continue;
      const created = await notify(
        studentId,
        "deadline",
        { homeworkId: hw.id, homeworkTitle: hw.title, course: hw.group.course.title, dueAt: hw.dueAt.toISOString() },
        { dedupeKey: `deadline:${hw.id}` },
      );
      if (created) sent++;
      else skipped++;
    }
  }
  return { homework: homework.length, sent, skipped };
}
