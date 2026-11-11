// The Student's data layer against a real database. The point of the file's header comment, "callers can never ask for
// another student's data", is tested head on: two students share a group, and every query is asked to leak.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ studentId: "", timezone: "Asia/Baku" }));
vi.mock("../auth", () => ({
  getCurrentStudent: async () => ({ id: state.studentId, name: "A", email: "a@x", timezone: state.timezone, locale: "en", mustChangePassword: false }),
}));

import { db } from "../db";
import { dayKey } from "../dates";
import {
  getAttendanceAlerts,
  getAttendanceByCourse,
  getDiaryDay,
  getHomework,
  getHomeworkList,
  getLessonsBetween,
  getMarksByCourse,
  getNotes,
  getNotesForDay,
  getNotificationPreferences,
  getNotifications,
  getRecentMarks,
  getStudentTerms,
  getTodos,
  getUnreadNotificationCount,
  homeworkState,
  receiptCode,
  resolveTerm,
} from "../data";
import { createWorld, daysFromNow, resetDatabase } from "../../../test/db";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
let n = 0;

// Student A is the signed-in student; B shares A's group; C is in no group.
async function setup() {
  const w = await createWorld();
  const b = await db.user.create({ data: { name: "B", email: `b${++n}@t.local`, passwordHash: "x", role: "student" } });
  const c = await db.user.create({ data: { name: "C", email: `c${++n}@t.local`, passwordHash: "x", role: "student" } });
  await db.enrollment.create({ data: { groupId: w.group.id, studentId: b.id } });
  state.studentId = w.student.id;
  state.timezone = "Asia/Baku";
  return { ...w, a: w.student, b, c };
}

beforeEach(async () => {
  await resetDatabase();
});
afterAll(() => db.$disconnect());

describe("homeworkState", () => {
  const due = new Date("2026-11-20T10:00:00Z");
  const before = new Date("2026-11-19T10:00:00Z");
  const after = new Date("2026-11-21T10:00:00Z");

  it("says what a student should do about a homework", () => {
    expect(homeworkState(due, undefined, before)).toBe("todo");
    expect(homeworkState(due, undefined, after)).toBe("overdue");
    expect(homeworkState(due, "returned", after)).toBe("returned"); // sent back: still theirs to redo, never "overdue"
    expect(homeworkState(due, "graded", after)).toBe("graded");
    expect(homeworkState(due, "submitted", after)).toBe("submitted");
    expect(homeworkState(due, "late", after)).toBe("submitted");
  });
});

describe("receiptCode", () => {
  it("is the last eight characters in two groups, upper case, so an admin can find the attempt", () => {
    expect(receiptCode("cmwc987abcdef1234")).toBe("CDEF-1234");
    expect(receiptCode("x1234abcd")).toBe("1234-ABCD");
  });
});

describe("terms", () => {
  it("lists the terms the student has courses in, newest first, and marks the current one", async () => {
    const w = await setup();
    const old = await db.term.create({ data: { name: "Spring", startDate: daysFromNow(-400), endDate: daysFromNow(-300), locked: true } });
    const oldGroup = await db.group.create({ data: { name: "S1", courseId: w.course.id, teacherId: w.teacher.id, termId: old.id } });
    await db.enrollment.create({ data: { groupId: oldGroup.id, studentId: w.a.id } });
    // A term only someone else is in is not theirs to see.
    const theirs = await db.term.create({ data: { name: "Other", startDate: daysFromNow(-30), endDate: daysFromNow(30) } });
    const theirGroup = await db.group.create({ data: { name: "O1", courseId: w.course.id, teacherId: w.teacher.id, termId: theirs.id } });
    await db.enrollment.create({ data: { groupId: theirGroup.id, studentId: w.b.id } });

    const terms = await getStudentTerms();
    expect(terms.map((t) => [t.name, t.current, t.ended, t.locked])).toEqual([
      ["Fall", true, false, false],
      ["Spring", false, true, true],
    ]);
  });

  it("falls back to the latest term that has started when none contains today", async () => {
    const w = await setup();
    await db.term.update({ where: { id: w.term.id }, data: { startDate: daysFromNow(-100), endDate: daysFromNow(-10) } });
    const terms = await getStudentTerms();
    expect(terms).toHaveLength(1);
    expect(terms[0]).toMatchObject({ current: true, ended: true });
  });

  it("gives the requested term if it is the student's own, otherwise the current one", async () => {
    const w = await setup();
    const old = await db.term.create({ data: { name: "Spring", startDate: daysFromNow(-400), endDate: daysFromNow(-300) } });
    const oldGroup = await db.group.create({ data: { name: "S1", courseId: w.course.id, teacherId: w.teacher.id, termId: old.id } });
    await db.enrollment.create({ data: { groupId: oldGroup.id, studentId: w.a.id } });
    const strangers = await db.term.create({ data: { name: "Hidden", startDate: daysFromNow(-5), endDate: daysFromNow(5) } });
    expect((await resolveTerm(old.id)).term?.name).toBe("Spring");
    expect((await resolveTerm(strangers.id)).term?.name).toBe("Fall");
    expect((await resolveTerm("nonsense")).term?.name).toBe("Fall");
    expect((await resolveTerm(undefined)).term?.name).toBe("Fall");
  });

  it("has no current term for a student with no courses", async () => {
    const w = await setup();
    state.studentId = w.c.id;
    expect(await getStudentTerms()).toEqual([]);
    expect((await resolveTerm(null)).term).toBeNull();
  });
});

describe("homework", () => {
  it("lists this term's homework in the student's groups, in the order due, each with the student's own state", async () => {
    const w = await setup();
    const sooner = await db.homework.create({ data: { groupId: w.group.id, title: "Sooner", dueAt: new Date(Date.now() + 2 * DAY), maxScore: 10 } });
    // B hands in; A has not. A must not see B's state.
    await db.submission.create({ data: { homeworkId: sooner.id, studentId: w.b.id, status: "graded", score: 9 } });
    const list = await getHomeworkList();
    expect(list.map((h) => h.title)).toEqual(["Sooner", "HW 1"]);
    expect(list.map((h) => h.state)).toEqual(["todo", "todo"]);
    expect(list[0].submission).toBeUndefined();

    await db.submission.create({ data: { homeworkId: sooner.id, studentId: w.a.id, status: "graded", score: 7 } });
    const after = await getHomeworkList();
    expect(after[0]).toMatchObject({ state: "graded", submission: { score: 7 } });
  });

  it("leaves out other terms, groups the student is not in, and groups they have left", async () => {
    const w = await setup();
    const old = await db.term.create({ data: { name: "Spring", startDate: daysFromNow(-400), endDate: daysFromNow(-300) } });
    const oldGroup = await db.group.create({ data: { name: "S1", courseId: w.course.id, teacherId: w.teacher.id, termId: old.id } });
    await db.enrollment.create({ data: { groupId: oldGroup.id, studentId: w.a.id } });
    await db.homework.create({ data: { groupId: oldGroup.id, title: "Last term", dueAt: daysFromNow(-350), maxScore: 10 } });
    const strangers = await db.group.create({ data: { name: "Z", courseId: w.course.id, teacherId: w.teacher.id, termId: w.term.id } });
    await db.homework.create({ data: { groupId: strangers.id, title: "Not theirs", dueAt: daysFromNow(3), maxScore: 10 } });
    expect((await getHomeworkList()).map((h) => h.title)).toEqual(["HW 1"]);

    await db.enrollment.updateMany({ where: { studentId: w.a.id, groupId: w.group.id }, data: { status: "dropped" } });
    expect(await getHomeworkList()).toEqual([]);
  });

  it("opens a homework with only the student's own work in it", async () => {
    const w = await setup();
    const mine = await db.submission.create({ data: { homeworkId: w.homework.id, studentId: w.a.id, status: "submitted", content: "my answer" } });
    const theirs = await db.submission.create({ data: { homeworkId: w.homework.id, studentId: w.b.id, status: "submitted", content: "B's secret answer" } });
    for (const [submission, studentId, note] of [[mine, w.a.id, "a"], [theirs, w.b.id, "b"]] as const) {
      const first = await db.submissionAttempt.create({ data: { submissionId: submission.id, number: 1, content: `${note}1` } });
      await db.submissionAttempt.create({ data: { submissionId: submission.id, number: 2, content: `${note}2` } });
      await db.submissionFile.create({ data: { homeworkId: w.homework.id, studentId, attemptId: first.id, name: `${note}.pdf`, size: 1, contentType: "application/pdf", storageKey: `k/${note}` } });
      await db.submissionFile.create({ data: { homeworkId: w.homework.id, studentId, name: `${note}-pending.pdf`, size: 1, contentType: "application/pdf", storageKey: `k/${note}p` } });
    }
    const hw = (await getHomework(w.homework.id))!;
    expect(hw.submission?.content).toBe("my answer");
    expect(hw.attempts.map((a) => a.content)).toEqual(["a2", "a1"]); // newest first
    expect(hw.attempts[1].files.map((f) => f.name)).toEqual(["a.pdf"]);
    expect(hw.pendingFiles.map((f) => f.name)).toEqual(["a-pending.pdf"]);
    expect(JSON.stringify(hw)).not.toContain("B's secret");
    expect(JSON.stringify(hw)).not.toContain("b.pdf");
    expect(hw).toMatchObject({ state: "submitted" });
    expect(hw.group.term.locked).toBe(false);
  });

  it("does not open a homework in a group the student is not in", async () => {
    const w = await setup();
    state.studentId = w.c.id;
    expect(await getHomework(w.homework.id)).toBeNull();
    expect(await getHomework("nonsense")).toBeNull();
  });
});

describe("marks", () => {
  it("groups a term's marks by course with the weighted average, and only the student's own", async () => {
    const w = await setup();
    const mark = (studentId: string, value: number, weight: number, extra: Record<string, unknown> = {}) =>
      db.mark.create({ data: { studentId, groupId: w.group.id, type: "quiz", value, weight, createdBy: w.teacher.id, ...extra } });
    await mark(w.a.id, 80, 1);
    await mark(w.a.id, 60, 3); // (80 + 180) / 4 = 65
    await mark(w.b.id, 100, 5); // not theirs
    const [course] = await getMarksByCourse(w.term.id);
    expect(course).toMatchObject({ course: "Math", groupName: "A1", gradingScale: "0-100", average: 65, finalGrade: null });
    expect(course.marks.map((m) => m.value).sort()).toEqual([60, 80]);
  });

  it("is empty for a term the student has no group in, and for a student with no marks", async () => {
    const w = await setup();
    const other = await db.term.create({ data: { name: "Other", startDate: daysFromNow(-5), endDate: daysFromNow(5) } });
    expect(await getMarksByCourse(other.id)).toEqual([]);
    const [course] = await getMarksByCourse(w.term.id);
    expect(course).toMatchObject({ marks: [], average: null });
  });

  it("shows a final grade only once the school has published it, and only the student's own", async () => {
    const w = await setup();
    await db.finalGrade.create({ data: { studentId: w.a.id, groupId: w.group.id, termId: w.term.id, value: 91, published: false } });
    await db.finalGrade.create({ data: { studentId: w.b.id, groupId: w.group.id, termId: w.term.id, value: 55, published: true } });
    expect((await getMarksByCourse(w.term.id))[0].finalGrade).toBeNull();
    await db.finalGrade.updateMany({ where: { studentId: w.a.id }, data: { published: true } });
    expect((await getMarksByCourse(w.term.id))[0].finalGrade).toBe(91);
  });

  it("lists the latest marks, newest first, limited, and only the student's own", async () => {
    const w = await setup();
    for (let i = 1; i <= 4; i++) {
      await db.mark.create({ data: { studentId: w.a.id, groupId: w.group.id, type: "quiz", value: i * 10, createdBy: w.teacher.id, createdAt: new Date(Date.now() - (5 - i) * HOUR) } });
    }
    await db.mark.create({ data: { studentId: w.b.id, groupId: w.group.id, type: "quiz", value: 99, createdBy: w.teacher.id } });
    expect((await getRecentMarks(3)).map((m) => m.value)).toEqual([40, 30, 20]);
    expect((await getRecentMarks(10)).map((m) => m.value)).toEqual([40, 30, 20, 10]);
  });
});

describe("attendance", () => {
  async function lessonsWith(w: Awaited<ReturnType<typeof setup>>, statuses: ("present" | "late" | "absent" | "excused")[], studentId = w.a.id) {
    for (const [i, status] of statuses.entries()) {
      const lesson = await db.lesson.create({
        data: { groupId: w.group.id, teacherId: w.teacher.id, startsAt: new Date(Date.now() - (i + 1) * DAY), endsAt: new Date(Date.now() - (i + 1) * DAY + HOUR) },
      });
      await db.attendance.create({ data: { lessonId: lesson.id, studentId, status } });
    }
  }

  it("works out the rate the way the school does: late counts as there, excused lessons do not count", async () => {
    const w = await setup();
    await lessonsWith(w, ["present", "late", "absent", "excused"]); // 2 of 3 counted lessons = 66.7%
    const { courses } = await getAttendanceByCourse(w.term.id);
    expect(courses).toHaveLength(1);
    expect(courses[0].rate).toBeCloseTo(2 / 3, 5);
    expect(courses[0].level).toBe("risk"); // under the default 70%
    expect(courses[0].records).toHaveLength(4);
  });

  it("is fine with no lessons yet, and does not mix in another student's attendance", async () => {
    const w = await setup();
    await lessonsWith(w, ["absent", "absent", "absent"], w.b.id);
    const { courses } = await getAttendanceByCourse(w.term.id);
    expect(courses[0]).toMatchObject({ rate: null, level: "ok", records: [] });
  });

  it("follows the school's own thresholds", async () => {
    const w = await setup();
    await lessonsWith(w, ["present", "present", "present", "absent"]); // 75%
    expect((await getAttendanceByCourse(w.term.id)).courses[0].level).toBe("warn"); // default: under 80
    await db.schoolSettings.upsert({ where: { id: 1 }, create: { id: 1, attendanceWarnBelow: 60, attendanceRiskBelow: 40 }, update: { attendanceWarnBelow: 60, attendanceRiskBelow: 40 } });
    expect((await getAttendanceByCourse(w.term.id)).courses[0].level).toBe("ok");
  });

  it("raises an alert for the current term only for a course that needs attention", async () => {
    const w = await setup();
    expect((await getAttendanceAlerts())?.alerts).toEqual([]);
    await lessonsWith(w, ["absent", "absent", "present"]);
    const result = await getAttendanceAlerts();
    expect(result?.alerts.map((a) => [a.course, a.level])).toEqual([["Math", "risk"]]);
  });

  it("has no alerts, and no failure, for a student with no courses", async () => {
    const w = await setup();
    state.studentId = w.c.id;
    expect(await getAttendanceAlerts()).toBeNull();
  });
});

describe("notes, to-dos and notifications", () => {
  it("lists only the student's own notes, newest day first, and finds a day's notes exactly", async () => {
    const w = await setup();
    const note = (studentId: string, date: string, text: string) => db.studentNote.create({ data: { studentId, date: new Date(`${date}T00:00:00Z`), text } });
    await note(w.a.id, "2026-11-10", "older");
    await note(w.a.id, "2026-11-12", "newer");
    await note(w.b.id, "2026-11-12", "B's private note");
    expect((await getNotes()).map((x) => x.text)).toEqual(["newer", "older"]);
    expect((await getNotes(1)).map((x) => x.text)).toEqual(["newer"]);
    expect((await getNotesForDay("2026-11-12")).map((x) => x.text)).toEqual(["newer"]);
    expect(await getNotesForDay("2026-11-11")).toEqual([]);
  });

  it("lists to-dos undone first, soonest due first, those without a day last", async () => {
    const w = await setup();
    const todo = (title: string, extra: Record<string, unknown> = {}) => db.studentTodo.create({ data: { studentId: w.a.id, title, ...extra } });
    await todo("done", { done: true, dueAt: new Date("2026-11-01") });
    await todo("no day");
    await todo("later", { dueAt: new Date("2026-11-20") });
    await todo("soon", { dueAt: new Date("2026-11-05") });
    await db.studentTodo.create({ data: { studentId: w.b.id, title: "B's" } });
    expect((await getTodos()).map((t) => t.title)).toEqual(["soon", "later", "no day", "done"]);
  });

  it("lists the latest notifications, newest first, at most 100, and counts the unread ones", async () => {
    const w = await setup();
    await db.notification.createMany({
      data: Array.from({ length: 105 }, (_, i) => ({ userId: w.a.id, type: "new_mark" as const, payload: { i }, createdAt: new Date(Date.now() - i * 1000), readAt: i < 5 ? new Date() : null })),
    });
    await db.notification.create({ data: { userId: w.b.id, type: "new_mark", payload: {} } });
    const list = await getNotifications();
    expect(list).toHaveLength(100);
    expect((list[0].payload as { i: number }).i).toBe(0);
    expect(await getUnreadNotificationCount()).toBe(100); // 105 minus the 5 read; B's is not counted
  });

  it("fills in the defaults for every notification type and applies the student's choices", async () => {
    const w = await setup();
    const defaults = await getNotificationPreferences();
    expect(defaults.deadline).toEqual({ email: true, push: true });
    expect(defaults.new_mark).toEqual({ email: false, push: true });
    await db.notificationPreference.create({ data: { userId: w.a.id, type: "new_mark", email: true, push: false } });
    await db.notificationPreference.create({ data: { userId: w.b.id, type: "deadline", email: false, push: false } });
    const prefs = await getNotificationPreferences();
    expect(prefs.new_mark).toEqual({ email: true, push: false });
    expect(prefs.deadline).toEqual({ email: true, push: true }); // B's choice is not A's
  });
});

describe("lessons and the diary day", () => {
  it("lists lessons in the student's groups in a time window, with only their own attendance", async () => {
    const w = await setup();
    const strangers = await db.group.create({ data: { name: "Z", courseId: w.course.id, teacherId: w.teacher.id, termId: w.term.id } });
    const at = (h: number) => new Date(Date.now() + h * HOUR);
    const mine = await db.lesson.create({ data: { groupId: w.group.id, teacherId: w.teacher.id, startsAt: at(2), endsAt: at(3) } });
    await db.lesson.create({ data: { groupId: strangers.id, teacherId: w.teacher.id, startsAt: at(2), endsAt: at(3) } });
    await db.lesson.create({ data: { groupId: w.group.id, teacherId: w.teacher.id, startsAt: at(30), endsAt: at(31) } }); // outside the window
    await db.attendance.create({ data: { lessonId: mine.id, studentId: w.a.id, status: "late", note: "bus" } });
    await db.attendance.create({ data: { lessonId: mine.id, studentId: w.b.id, status: "absent" } });
    const lessons = await getLessonsBetween(at(0), at(10));
    expect(lessons).toHaveLength(1);
    expect(lessons[0]).toMatchObject({ id: mine.id });
    expect(lessons[0].attendance).toMatchObject([{ status: "late", note: "bus" }]);
  });

  it("collects what belongs to one day in the student's own timezone", async () => {
    const w = await setup();
    const key = dayKey(new Date(Date.now() + 2 * DAY), "Asia/Baku");
    const startOfDayUtc = new Date(`${key}T00:00:00+04:00`); // midnight in Baku
    const inDay = new Date(startOfDayUtc.getTime() + 21 * HOUR); // 21:00 Baku: still that day
    const justBefore = new Date(startOfDayUtc.getTime() - 30 * 60_000); // 23:30 the day before in Baku
    await db.lesson.create({ data: { groupId: w.group.id, teacherId: w.teacher.id, startsAt: inDay, endsAt: new Date(inDay.getTime() + HOUR), topic: "In the day" } });
    await db.lesson.create({ data: { groupId: w.group.id, teacherId: w.teacher.id, startsAt: justBefore, endsAt: new Date(justBefore.getTime() + HOUR), topic: "The day before" } });
    await db.homework.create({ data: { groupId: w.group.id, title: "Due that day", dueAt: inDay, maxScore: 5 } });
    await db.mark.create({ data: { studentId: w.a.id, groupId: w.group.id, type: "quiz", value: 50, createdBy: w.teacher.id, createdAt: inDay } });
    await db.mark.create({ data: { studentId: w.b.id, groupId: w.group.id, type: "quiz", value: 51, createdBy: w.teacher.id, createdAt: inDay } });
    await db.studentNote.create({ data: { studentId: w.a.id, date: new Date(`${key}T00:00:00Z`), text: "note for the day" } });

    const day = await getDiaryDay(key);
    expect(day.lessons.map((l) => l.topic)).toEqual(["In the day"]);
    expect(day.homeworkDue.map((h) => h.title)).toEqual(["Due that day"]);
    expect(day.marks.map((m) => m.value)).toEqual([50]);
    expect(day.notes.map((x) => x.text)).toEqual(["note for the day"]);
  });
});
