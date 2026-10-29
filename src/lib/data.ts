import "server-only";
import { db } from "./db";
import { getCurrentStudent } from "./auth";
import { dayRange, type DayKey } from "./dates";
import type { AttendanceStatus, SubmissionStatus } from "@/generated/prisma/enums";

// Every query here resolves the student itself, so callers can never ask for
// another student's data by passing an id.

async function activeGroupIds(studentId: string) {
  const rows = await db.enrollment.findMany({
    where: { studentId, status: "active" },
    select: { groupId: true },
  });
  return rows.map((r) => r.groupId);
}

const lessonInclude = {
  group: { select: { id: true, name: true, course: { select: { title: true } } } },
  teacher: { select: { name: true } },
} as const;

export async function getLessonsBetween(start: Date, end: Date) {
  const student = await getCurrentStudent();
  const groupIds = await activeGroupIds(student.id);
  return db.lesson.findMany({
    where: { groupId: { in: groupIds }, startsAt: { gte: start, lt: end } },
    include: {
      ...lessonInclude,
      attendance: { where: { studentId: student.id }, select: { status: true, note: true } },
      homework: { select: { id: true, title: true, dueAt: true } },
    },
    orderBy: { startsAt: "asc" },
  });
}

export type LessonWithDetails = Awaited<ReturnType<typeof getLessonsBetween>>[number];

// ---------- Homework ----------

export type HomeworkState = "todo" | "returned" | "submitted" | "graded" | "overdue";

export function homeworkState(dueAt: Date, status: SubmissionStatus | undefined, now: Date): HomeworkState {
  if (!status) return dueAt < now ? "overdue" : "todo";
  if (status === "returned") return "returned";
  if (status === "graded") return "graded";
  return "submitted";
}

export async function getHomeworkList() {
  const student = await getCurrentStudent();
  const groupIds = await activeGroupIds(student.id);
  const rows = await db.homework.findMany({
    where: { groupId: { in: groupIds } },
    include: {
      group: { select: { name: true, course: { select: { title: true } } } },
      submissions: {
        where: { studentId: student.id },
        select: { status: true, score: true, submittedAt: true },
      },
    },
    orderBy: { dueAt: "asc" },
  });
  const now = new Date();
  return rows.map(({ submissions, ...hw }) => {
    const submission = submissions[0];
    return { ...hw, submission, state: homeworkState(hw.dueAt, submission?.status, now) };
  });
}

export type HomeworkItem = Awaited<ReturnType<typeof getHomeworkList>>[number];

export async function getHomework(id: string) {
  const student = await getCurrentStudent();
  const groupIds = await activeGroupIds(student.id);
  const hw = await db.homework.findFirst({
    where: { id, groupId: { in: groupIds } },
    include: {
      group: { select: { name: true, course: { select: { title: true } }, teacher: { select: { name: true } } } },
      lesson: { select: { startsAt: true, topic: true } },
      submissions: { where: { studentId: student.id } },
    },
  });
  if (!hw) return null;
  const { submissions, ...rest } = hw;
  const submission = submissions[0] ?? null;
  return { ...rest, submission, state: homeworkState(hw.dueAt, submission?.status, new Date()) };
}

// ---------- Marks ----------

export function weightedAverage(marks: { value: number; weight: number }[]) {
  const totalWeight = marks.reduce((s, m) => s + m.weight, 0);
  if (totalWeight === 0) return null;
  return marks.reduce((s, m) => s + m.value * m.weight, 0) / totalWeight;
}

export async function getMarksByCourse() {
  const student = await getCurrentStudent();
  const enrollments = await db.enrollment.findMany({
    where: { studentId: student.id },
    include: {
      group: {
        include: {
          course: { select: { title: true, gradingScale: true } },
          term: { select: { name: true } },
          marks: {
            where: { studentId: student.id },
            include: { homework: { select: { title: true } }, lesson: { select: { topic: true } } },
            orderBy: { createdAt: "desc" },
          },
          finalGrades: { where: { studentId: student.id, published: true }, select: { value: true } },
        },
      },
    },
  });
  return enrollments.map(({ group }) => ({
    groupId: group.id,
    groupName: group.name,
    course: group.course.title,
    gradingScale: group.course.gradingScale,
    term: group.term.name,
    marks: group.marks,
    average: weightedAverage(group.marks),
    finalGrade: group.finalGrades[0]?.value ?? null,
  }));
}

export async function getRecentMarks(limit: number) {
  const student = await getCurrentStudent();
  return db.mark.findMany({
    where: { studentId: student.id },
    include: { group: { select: { course: { select: { title: true } } } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

// ---------- Attendance ----------

export function attendanceRate(statuses: AttendanceStatus[]) {
  const counted = statuses.filter((s) => s !== "excused");
  if (counted.length === 0) return null;
  return counted.filter((s) => s === "present" || s === "late").length / counted.length;
}

export async function getAttendanceByCourse() {
  const student = await getCurrentStudent();
  const enrollments = await db.enrollment.findMany({
    where: { studentId: student.id },
    include: { group: { include: { course: { select: { title: true } } } } },
  });
  const records = await db.attendance.findMany({
    where: { studentId: student.id },
    include: { lesson: { select: { startsAt: true, topic: true, groupId: true } } },
    orderBy: { lesson: { startsAt: "desc" } },
  });
  return enrollments.map(({ group }) => {
    const rows = records.filter((r) => r.lesson.groupId === group.id);
    return {
      groupId: group.id,
      course: group.course.title,
      groupName: group.name,
      records: rows,
      rate: attendanceRate(rows.map((r) => r.status)),
    };
  });
}

// ---------- Notes & to-dos ----------

export async function getNotes(limit = 50) {
  const student = await getCurrentStudent();
  return db.studentNote.findMany({
    where: { studentId: student.id },
    include: { lesson: { select: { topic: true, group: { select: { course: { select: { title: true } } } } } } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: limit,
  });
}

export async function getNotesForDay(key: DayKey) {
  const student = await getCurrentStudent();
  return db.studentNote.findMany({
    where: { studentId: student.id, date: new Date(`${key}T00:00:00Z`) },
    orderBy: { createdAt: "asc" },
  });
}

export async function getTodos() {
  const student = await getCurrentStudent();
  return db.studentTodo.findMany({
    where: { studentId: student.id },
    orderBy: [{ done: "asc" }, { dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
  });
}

// ---------- Notifications ----------

export async function getNotifications() {
  const student = await getCurrentStudent();
  return db.notification.findMany({
    where: { userId: student.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function getUnreadNotificationCount() {
  const student = await getCurrentStudent();
  return db.notification.count({ where: { userId: student.id, readAt: null } });
}

// ---------- Diary day ----------

export async function getDiaryDay(key: DayKey) {
  const student = await getCurrentStudent();
  const { start, end } = dayRange(key, student.timezone);
  const groupIds = await activeGroupIds(student.id);
  const [lessons, homeworkDue, marks, notes] = await Promise.all([
    getLessonsBetween(start, end),
    db.homework.findMany({
      where: { groupId: { in: groupIds }, dueAt: { gte: start, lt: end } },
      include: {
        group: { select: { course: { select: { title: true } } } },
        submissions: { where: { studentId: student.id }, select: { status: true } },
      },
      orderBy: { dueAt: "asc" },
    }),
    db.mark.findMany({
      where: { studentId: student.id, createdAt: { gte: start, lt: end } },
      include: { group: { select: { course: { select: { title: true } } } } },
      orderBy: { createdAt: "asc" },
    }),
    getNotesForDay(key),
  ]);
  return { lessons, homeworkDue, marks, notes };
}
