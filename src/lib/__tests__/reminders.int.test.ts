import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ failFor: new Set<string>(), calls: [] as string[] }));
vi.mock("../notifications/notify", () => ({
  notify: vi.fn(async (userId: string) => {
    state.calls.push(userId);
    if (state.failFor.has(userId)) throw new Error("push service down");
    return true;
  }),
}));

import { db } from "../db";
import { sendDeadlineReminders } from "../notifications/reminders";
import { createWorld, resetDatabase } from "../../../test/db";

const HOUR = 3_600_000;
let n = 0;
const student = () =>
  db.user.create({ data: { name: "S", email: `s${++n}@t.local`, passwordHash: "x", role: "student" } });

async function worldDueIn(hours: number) {
  const w = await createWorld();
  await db.homework.update({ where: { id: w.homework.id }, data: { dueAt: new Date(Date.now() + hours * HOUR) } });
  return w;
}

beforeEach(async () => {
  await resetDatabase();
  state.failFor.clear();
  state.calls.length = 0;
});
afterAll(() => db.$disconnect());

describe("sendDeadlineReminders (real database)", () => {
  it("reminds enrolled students who have not handed in, and only those", async () => {
    const w = await worldDueIn(10);
    const done = await student();
    const waiting = await student();
    for (const s of [done, waiting]) await db.enrollment.create({ data: { groupId: w.group.id, studentId: s.id } });
    await db.submission.create({ data: { homeworkId: w.homework.id, studentId: done.id, content: "x" } });

    const result = await sendDeadlineReminders();
    expect(result).toMatchObject({ homework: 1, sent: 2, skipped: 0, failed: 0 });
    // w.student (enrolled by createWorld) and `waiting`, not `done`.
    expect(state.calls.sort()).toEqual([w.student.id, waiting.id].sort());
  });

  it("ignores homework due beyond the window, already past, or in a locked term", async () => {
    const far = await worldDueIn(60);
    expect(await sendDeadlineReminders()).toMatchObject({ homework: 0, sent: 0 });
    await db.homework.update({ where: { id: far.homework.id }, data: { dueAt: new Date(Date.now() - HOUR) } });
    expect(await sendDeadlineReminders()).toMatchObject({ homework: 0, sent: 0 });
    await db.homework.update({ where: { id: far.homework.id }, data: { dueAt: new Date(Date.now() + 5 * HOUR) } });
    await db.term.update({ where: { id: far.term.id }, data: { locked: true } });
    expect(await sendDeadlineReminders()).toMatchObject({ homework: 0, sent: 0 });
  });

  it("one student's failure does not cost the others their reminder", async () => {
    const w = await worldDueIn(10);
    const others = await Promise.all(Array.from({ length: 12 }, student));
    for (const s of others) await db.enrollment.create({ data: { groupId: w.group.id, studentId: s.id } });
    state.failFor.add(others[3].id);

    const result = await sendDeadlineReminders();
    expect(result).toMatchObject({ sent: 12, failed: 1 });
    expect(state.calls).toHaveLength(13);
  });

  it("counts a repeat (notify answers false for a duplicate) as skipped, not sent", async () => {
    const { notify } = await import("../notifications/notify");
    vi.mocked(notify).mockResolvedValueOnce(false);
    await worldDueIn(10);
    expect(await sendDeadlineReminders()).toMatchObject({ sent: 0, skipped: 1, failed: 0 });
  });
});
