import "server-only";
import { db } from "./db";
import { getCurrentStudent } from "./auth";
import { dayKey, dayRange, type DayKey } from "./dates";
import type { NotificationType, SubmissionStatus } from "@/generated/prisma/enums";
import { EMAIL_DEFAULTS, NOTIFICATION_TYPES, PUSH_DEFAULTS } from "./notifications/types";
import { attendanceLevel, attendanceRate, needsAttention, weightedAverage } from "./grading";
import { getSchoolSettings } from "./settings";

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

const fileFields = { id: true, name: true, size: true, contentType: true } as const;

export async function getHomework(id: string) {
  const student = await getCurrentStudent();
  const groupIds = await activeGroupIds(student.id);
  const hw = await db.homework.findFirst({
    where: { id, groupId: { in: groupIds } },
    include: {
      group: { select: { name: true, course: { select: { title: true } }, teacher: { select: { name: true } } } },
      lesson: { select: { startsAt: true, topic: true } },
      submissions: {
        where: { studentId: student.id },
        include: {
          attempts: {
            orderBy: { number: "desc" },
            include: { files: { select: fileFields, orderBy: { createdAt: "asc" } } },
          },
        },
      },
      // Uploaded but not handed in yet: only the student sees these.
      uploads: { where: { studentId: student.id, attemptId: null }, select: fileFields, orderBy: { createdAt: "asc" } },
    },
  });
  if (!hw) return null;
  const { submissions, uploads, ...rest } = hw;
  const submission = submissions[0] ?? null;
  return {
    ...rest,
    submission,
    attempts: submission?.attempts ?? [],
    pendingFiles: uploads,
    state: homeworkState(hw.dueAt, submission?.status, new Date()),
  };
}

export type HomeworkAttempt = NonNullable<Awaited<ReturnType<typeof getHomework>>>["attempts"][number];

// Short code printed on the receipt; an admin can find the attempt by its id suffix.
export function receiptCode(attemptId: string) {
  const tail = attemptId.slice(-8).toUpperCase();
  return `${tail.slice(0, 4)}-${tail.slice(4)}`;
}

// ---------- Terms ----------

// The terms the student has courses in, newest first. "current" is the one that
// contains today, or else the latest one that has started.
export async function getStudentTerms() {
  const student = await getCurrentStudent();
  const terms = await db.term.findMany({
    where: { groups: { some: { enrollments: { some: { studentId: student.id } } } } },
    orderBy: { startDate: "desc" },
  });
  const today = dayKey(new Date(), student.timezone);
  const key = (d: Date) => d.toISOString().slice(0, 10);
  const current =
    terms.find((t) => key(t.startDate) <= today && today <= key(t.endDate)) ??
    terms.find((t) => key(t.startDate) <= today) ??
    terms[terms.length - 1];
  return terms.map((t) => ({
    id: t.id,
    name: t.name,
    startDate: t.startDate,
    endDate: t.endDate,
    locked: t.locked,
    ended: key(t.endDate) < today,
    current: t.id === current?.id,
  }));
}

export type StudentTerm = Awaited<ReturnType<typeof getStudentTerms>>[number];

// The requested term if it's one of the student's, otherwise the current one.
export async function resolveTerm(requested: unknown) {
  const terms = await getStudentTerms();
  const term = terms.find((t) => t.id === requested) ?? terms.find((t) => t.current) ?? null;
  return { terms, term };
}

// ---------- Marks ----------

export async function getMarksByCourse(termId: string) {
  const student = await getCurrentStudent();
  const enrollments = await db.enrollment.findMany({
    where: { studentId: student.id, group: { termId } },
    include: {
      group: {
        include: {
          course: { select: { title: true, gradingScale: true } },
          marks: {
            where: { studentId: student.id },
            include: { homework: { select: { title: true } }, lesson: { select: { topic: true } } },
            orderBy: { createdAt: "desc" },
          },
          // Only published final grades ever reach the student.
          finalGrades: { where: { studentId: student.id, termId, published: true }, select: { value: true } },
        },
      },
    },
    orderBy: { group: { course: { title: "asc" } } },
  });
  return enrollments.map(({ group }) => ({
    groupId: group.id,
    groupName: group.name,
    course: group.course.title,
    gradingScale: group.course.gradingScale,
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

export async function getAttendanceByCourse(termId: string) {
  const student = await getCurrentStudent();
  const [enrollments, settings] = await Promise.all([
    db.enrollment.findMany({
      where: { studentId: student.id, group: { termId } },
      include: { group: { include: { course: { select: { title: true } } } } },
      orderBy: { group: { course: { title: "asc" } } },
    }),
    getSchoolSettings(),
  ]);
  const records = await db.attendance.findMany({
    where: { studentId: student.id, lesson: { group: { termId } } },
    include: { lesson: { select: { startsAt: true, topic: true, groupId: true } } },
    orderBy: { lesson: { startsAt: "desc" } },
  });
  const courses = enrollments.map(({ group }) => {
    const rows = records.filter((r) => r.lesson.groupId === group.id);
    const rate = attendanceRate(rows.map((r) => r.status));
    return {
      groupId: group.id,
      course: group.course.title,
      groupName: group.name,
      records: rows,
      rate,
      level: attendanceLevel(rate, settings),
    };
  });
  return { courses, settings };
}

// Courses in the current term whose attendance needs attention (for Today).
export async function getAttendanceAlerts() {
  const { term } = await resolveTerm(null);
  if (!term) return null;
  const { courses, settings } = await getAttendanceByCourse(term.id);
  return { alerts: courses.filter(needsAttention), settings };
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

export async function getNotificationPreferences() {
  const student = await getCurrentStudent();
  const rows = await db.notificationPreference.findMany({ where: { userId: student.id } });
  return Object.fromEntries(
    NOTIFICATION_TYPES.map((type) => {
      const row = rows.find((r) => r.type === type);
      return [type, { email: row?.email ?? EMAIL_DEFAULTS[type], push: row?.push ?? PUSH_DEFAULTS[type] }];
    }),
  ) as Record<NotificationType, { email: boolean; push: boolean }>;
}

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
