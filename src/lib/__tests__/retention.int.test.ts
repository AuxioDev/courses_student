import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({ failKeys: new Set<string>(), deleted: [] as string[] }));
vi.mock("../storage", () => ({
  deleteObject: vi.fn(async (key: string) => {
    if (storage.failKeys.has(key)) throw new Error("storage down");
    storage.deleted.push(key);
  }),
}));

import { db } from "../db";
import { runRetention } from "../retention";
import { createWorld, resetDatabase } from "../../../test/db";

const DAY = 86_400_000;
let n = 0;

// A student whose account was closed long enough ago to be erased, holding private data and a file.
async function dueStudent(w: Awaited<ReturnType<typeof createWorld>>, fileKey: string) {
  const user = await db.user.create({
    data: { name: "Gone", email: `gone${++n}@t.local`, passwordHash: "x", role: "student", active: false, deactivatedAt: new Date(Date.now() - 800 * DAY) },
  });
  await db.studentNote.create({ data: { studentId: user.id, date: new Date("2026-01-01"), text: "private" } });
  await db.studentTodo.create({ data: { studentId: user.id, title: "private" } });
  await db.submissionFile.create({
    data: { homeworkId: w.homework.id, studentId: user.id, name: "a.pdf", size: 1, contentType: "application/pdf", storageKey: fileKey },
  });
  return user;
}

beforeEach(async () => {
  await resetDatabase();
  storage.failKeys.clear();
  storage.deleted.length = 0;
});
afterAll(() => db.$disconnect());

describe("runRetention (real database)", () => {
  it("erases private data and stored files of students past the retention period, and keeps everyone else", async () => {
    const w = await createWorld();
    const gone = await dueStudent(w, "files/gone-1");
    const result = await runRetention();

    expect(result).toMatchObject({ erased: 1, failed: 0, filesNotDeleted: 0 });
    expect(await db.studentNote.count({ where: { studentId: gone.id } })).toBe(0);
    expect(await db.studentTodo.count({ where: { studentId: gone.id } })).toBe(0);
    expect(await db.submissionFile.count({ where: { studentId: gone.id } })).toBe(0);
    expect((await db.user.findUniqueOrThrow({ where: { id: gone.id } })).privateDataErasedAt).toBeInstanceOf(Date);
    expect(storage.deleted).toEqual(["files/gone-1"]);
    // The active student from the world was not touched.
    expect((await db.user.findUniqueOrThrow({ where: { id: w.student.id } })).privateDataErasedAt).toBeNull();
  });

  it("a file that will not delete is counted, not thrown, and the other files still go", async () => {
    const w = await createWorld();
    const a = await dueStudent(w, "files/bad");
    await db.submissionFile.create({
      data: { homeworkId: w.homework.id, studentId: a.id, name: "b.pdf", size: 1, contentType: "application/pdf", storageKey: "files/good" },
    });
    storage.failKeys.add("files/bad");

    const result = await runRetention();
    expect(result).toMatchObject({ erased: 1, failed: 0, filesNotDeleted: 1 });
    expect(storage.deleted).toEqual(["files/good"]);
  });

  it("one student's failed erasure does not stop the others", async () => {
    const w = await createWorld();
    const users = [];
    for (let i = 0; i < 5; i++) users.push(await dueStudent(w, `files/u${i}`));
    // The first student to be processed fails inside the transaction.
    const notes = db.studentNote;
    const realDeleteMany = notes.deleteMany.bind(notes);
    let injected = false;
    vi.spyOn(notes, "deleteMany").mockImplementation(((args: Parameters<typeof realDeleteMany>[0]) => {
      if (!injected) {
        injected = true;
        throw new Error("database hiccup");
      }
      return realDeleteMany(args);
    }) as never);

    const result = await runRetention();
    expect(result).toMatchObject({ erased: 4, failed: 1 });
    const erased = await db.user.count({ where: { id: { in: users.map((u) => u.id) }, privateDataErasedAt: { not: null } } });
    expect(erased).toBe(4);

    // The failed one is retried by the next run (the spy now passes every call through).
    expect(await runRetention()).toMatchObject({ erased: 1, failed: 0 });
  });
});
