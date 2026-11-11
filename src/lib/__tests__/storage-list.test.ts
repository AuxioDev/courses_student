import { mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

// LOCAL_ROOT is read when the module loads, so the folder must exist before the import.
const root = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { mkdtempSync } = require("node:fs") as typeof import("node:fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { tmpdir } = require("node:os") as typeof import("node:os");
  const dir = mkdtempSync(`${tmpdir()}/storage-list-`);
  process.env.UPLOADS_DIR = dir;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.VERCEL;
  return dir;
});

import { listObjects } from "../storage";

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("listObjects (local disk)", () => {
  it("lists stored files with their age, and ignores anything that is not a valid key", async () => {
    const dir = path.join(root, "submissions", "hw1", "stu1");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "AbC_123-x.pdf"), "x");
    writeFileSync(path.join(dir, "notes.txt.bak.tmp~"), "x");
    const old = new Date("2026-01-01T00:00:00Z");
    utimesSync(path.join(dir, "AbC_123-x.pdf"), old, old);

    const found = await listObjects();
    expect(found).toHaveLength(1);
    expect(found[0].key).toBe("submissions/hw1/stu1/AbC_123-x.pdf");
    expect(found[0].uploadedAt.getTime()).toBe(old.getTime());
  });

  it("returns an empty list when nothing was ever uploaded", async () => {
    rmSync(path.join(root, "submissions"), { recursive: true, force: true });
    expect(await listObjects()).toEqual([]);
  });
});
