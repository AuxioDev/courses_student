import { NextResponse } from "next/server";
import { getStudentOrNull } from "@/lib/auth";
import { db } from "@/lib/db";

// Everything the Diary stores about the signed-in student, as one JSON file.
// Passwords, tokens, login attempts and push keys are deliberately left out,
// as are final grades that haven't been published.
export async function GET() {
  const student = await getStudentOrNull();
  if (!student) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = student.id;

  const [profile, enrollments, attendance, marks, finalGrades, submissions, files, notes, todos, notifications, preferences] =
    await Promise.all([
      db.user.findUniqueOrThrow({
        where: { id },
        select: { name: true, email: true, timezone: true, locale: true, createdAt: true, privacyVersion: true, privacyAcceptedAt: true },
      }),
      db.enrollment.findMany({
        where: { studentId: id },
        select: { status: true, group: { select: { name: true, course: { select: { title: true } }, term: { select: { name: true } } } } },
      }),
      db.attendance.findMany({
        where: { studentId: id },
        select: { status: true, note: true, lesson: { select: { startsAt: true, topic: true } } },
      }),
      db.mark.findMany({
        where: { studentId: id },
        select: { type: true, value: true, weight: true, comment: true, createdAt: true, group: { select: { course: { select: { title: true } } } } },
      }),
      db.finalGrade.findMany({
        where: { studentId: id, published: true },
        select: { value: true, term: { select: { name: true } }, group: { select: { course: { select: { title: true } } } } },
      }),
      db.submission.findMany({
        where: { studentId: id },
        select: {
          status: true,
          homework: { select: { title: true, dueAt: true } },
          attempts: { select: { number: true, content: true, links: true, submittedAt: true, late: true, outcome: true, score: true, feedback: true } },
        },
      }),
      db.submissionFile.findMany({ where: { studentId: id }, select: { id: true, name: true, size: true, contentType: true, createdAt: true } }),
      db.studentNote.findMany({ where: { studentId: id }, select: { date: true, text: true, createdAt: true } }),
      db.studentTodo.findMany({ where: { studentId: id }, select: { title: true, dueAt: true, done: true, createdAt: true } }),
      db.notification.findMany({ where: { userId: id }, select: { type: true, payload: true, readAt: true, createdAt: true } }),
      db.notificationPreference.findMany({ where: { userId: id }, select: { type: true, email: true, push: true } }),
    ]);

  const body = JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      profile,
      enrollments,
      attendance,
      marks,
      finalGrades,
      submissions,
      files: files.map((f) => ({ ...f, url: `/api/files/${f.id}?download` })),
      notes,
      todos,
      notifications,
      notificationPreferences: preferences,
    },
    null,
    2,
  );
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="student-diary-data.json"',
      "Cache-Control": "no-store",
    },
  });
}
