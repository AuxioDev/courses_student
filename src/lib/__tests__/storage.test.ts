// The local-disk storage driver (what development and the end-to-end suite use) and the choice of driver.
import { rmSync } from "node:fs";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

const root = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("node:fs") as typeof import("node:fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const os = require("node:os") as typeof import("node:os");
  const dir = fs.mkdtempSync(`${os.tmpdir()}/storage-`);
  process.env.UPLOADS_DIR = dir;
  return dir;
});

import { deleteObject, isValidKey, objectSize, readObject, readObjectStart, storageDriver, writeLocalObject } from "../storage";

afterEach(() => vi.unstubAllEnvs());
afterAll(() => rmSync(root, { recursive: true, force: true }));

const KEY = "submissions/hw1/stu1/AbC_123-x.pdf";
const bytes = (s: string) => new TextEncoder().encode(s);
const text = async (stream: ReadableStream<Uint8Array> | null) => (stream ? await new Response(stream).text() : null);

describe("which storage is used", () => {
  it("is the local disk without a Blob token, and the Blob store with one", () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    vi.stubEnv("VERCEL", "");
    expect(storageDriver()).toBe("local");
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "vercel_blob_rw_x_y");
    expect(storageDriver()).toBe("blob");
  });

  it("refuses to quietly use the local disk on Vercel, where it would be lost", () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    vi.stubEnv("VERCEL", "1");
    expect(() => storageDriver()).toThrow(/BLOB_READ_WRITE_TOKEN/);
  });
});

describe("storage keys", () => {
  it("accept only the shape the app issues, which is what keeps a key from reaching outside the folder", () => {
    expect(isValidKey(KEY)).toBe(true);
    for (const bad of ["../etc/passwd", "submissions/../../x/y/z.pdf", "submissions/a/b/c", "/submissions/a/b/c.pdf", "submissions/a/b/c.pdf/extra", "submissions/A B/c/d.pdf", "submissions/a/b/\u0000.pdf", "other/a/b/c.pdf", ""]) {
      expect(isValidKey(bad), bad).toBe(false);
    }
  });
});

describe("local driver", () => {
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
  vi.stubEnv("VERCEL", "");

  it("stores, sizes, reads, previews and deletes a file", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    vi.stubEnv("VERCEL", "");
    expect(await objectSize(KEY)).toBeNull();
    expect(await readObject(KEY)).toBeNull();

    await writeLocalObject(KEY, bytes("%PDF-1.7 hello world"));
    expect(await objectSize(KEY)).toBe(20);
    expect(await text(await readObject(KEY))).toBe("%PDF-1.7 hello world");
    expect(new TextDecoder().decode((await readObjectStart(KEY, 5))!)).toBe("%PDF-");

    await deleteObject(KEY);
    expect(await objectSize(KEY)).toBeNull();
    await deleteObject(KEY); // deleting what is already gone is not an error
  });

  it("will not overwrite a file that is already there (the browser's key is single-use)", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    vi.stubEnv("VERCEL", "");
    const key = "submissions/hw1/stu1/once.pdf";
    await writeLocalObject(key, bytes("first"));
    await expect(writeLocalObject(key, bytes("second"))).rejects.toThrow();
    expect(await text(await readObject(key))).toBe("first");
  });

  it("refuses a key that is not one of ours before it touches the disk", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    vi.stubEnv("VERCEL", "");
    await expect(writeLocalObject("../../escape.txt", bytes("x"))).rejects.toThrow(/Invalid storage key/);
    expect(await objectSize("../../escape.txt")).toBeNull();
    expect(await readObject("../../escape.txt")).toBeNull();
  });

  it("reads the start of a file that is shorter than asked for, and of a missing one", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    vi.stubEnv("VERCEL", "");
    const key = "submissions/hw1/stu1/short.pdf";
    await writeLocalObject(key, bytes("abc"));
    expect(new TextDecoder().decode((await readObjectStart(key, 512))!)).toBe("abc");
    expect(await readObjectStart("submissions/hw1/stu1/missing.pdf")).toBeNull();
  });
});
