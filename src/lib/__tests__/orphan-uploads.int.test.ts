import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({ objects: [] as { key: string; uploadedAt: Date }[], deleted: [] as string[], failKeys: new Set<string>() }));
vi.mock("../storage", () => ({
  listObjects: vi.fn(async () => store.objects),
  deleteObject: vi.fn(async (key: string) => {
    if (store.failKeys.has(key)) throw new Error("storage down");
    store.deleted.push(key);
  }),
}));

import { db } from "../db";
import { sweepOrphanUploads, MAX_ORPHAN_DELETIONS } from "../orphan-uploads";
import { createWorld, resetDatabase } from "../../../test/db";

const HOUR = 3_600_000;
const ago = (hours: number) => new Date(Date.now() - hours * HOUR);
const key = (name: string) => `submissions/h1/s1/${name}.pdf`;

beforeEach(async () => {
  await resetDatabase();
  store.objects = [];
  store.deleted.length = 0;
  store.failKeys.clear();
});
afterAll(() => db.$disconnect());

describe("sweepOrphanUploads (real database)", () => {
  it("deletes old files no row points at, and keeps attached ones and fresh ones", async () => {
    const w = await createWorld();
    await db.submissionFile.create({
      data: { homeworkId: w.homework.id, studentId: w.student.id, name: "a.pdf", size: 1, contentType: "application/pdf", storageKey: key("attached") },
    });
    store.objects = [
      { key: key("attached"), uploadedAt: ago(72) }, // old but attached: keep
      { key: key("orphan"), uploadedAt: ago(30) }, // old, no row: delete
      { key: key("fresh"), uploadedAt: ago(1) }, // not yet attached, but only an hour old: keep
    ];
    expect(await sweepOrphanUploads()).toEqual({ orphaned: 1, deleted: 1, failed: 0 });
    expect(store.deleted).toEqual([key("orphan")]);
  });

  it("a file shared by two rows (kept for a new attempt) is not an orphan", async () => {
    const w = await createWorld();
    for (const name of ["one.pdf", "two.pdf"]) {
      await db.submissionFile.create({
        data: { homeworkId: w.homework.id, studentId: w.student.id, name, size: 1, contentType: "application/pdf", storageKey: key("shared") },
      });
    }
    store.objects = [{ key: key("shared"), uploadedAt: ago(100) }];
    expect(await sweepOrphanUploads()).toMatchObject({ orphaned: 0, deleted: 0 });
  });

  it("counts a failed delete and still deletes the rest", async () => {
    store.objects = [
      { key: key("a"), uploadedAt: ago(30) },
      { key: key("b"), uploadedAt: ago(30) },
      { key: key("c"), uploadedAt: ago(30) },
    ];
    store.failKeys.add(key("b"));
    expect(await sweepOrphanUploads()).toEqual({ orphaned: 3, deleted: 2, failed: 1 });
    expect(store.deleted.sort()).toEqual([key("a"), key("c")]);
  });

  it("deletes at most one batch per run and reports how many are left", async () => {
    store.objects = Array.from({ length: MAX_ORPHAN_DELETIONS + 40 }, (_, i) => ({ key: key(`o${i}`), uploadedAt: ago(30) }));
    const result = await sweepOrphanUploads();
    expect(result).toEqual({ orphaned: MAX_ORPHAN_DELETIONS + 40, deleted: MAX_ORPHAN_DELETIONS, failed: 0 });
  });

  it("does nothing on an empty store", async () => {
    expect(await sweepOrphanUploads()).toEqual({ orphaned: 0, deleted: 0, failed: 0 });
  });
});
