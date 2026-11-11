import "server-only";
import { createReadStream } from "node:fs";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { del, get, head, list } from "@vercel/blob";
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";

// Homework files live in a private Vercel Blob store in production. Without
// BLOB_READ_WRITE_TOKEN (local development) they go to ./.uploads instead.

export type Driver = "blob" | "local";

export function storageDriver(): Driver {
  if (process.env.BLOB_READ_WRITE_TOKEN) return "blob";
  if (process.env.VERCEL) throw new Error("BLOB_READ_WRITE_TOKEN is required on Vercel");
  return "local";
}

// UPLOADS_DIR lets a local Teacher App (which reads the same variable) and tests share a folder.
// Only configurable in development. The annotation keeps Turbopack from tracing the whole project for it.
const LOCAL_ROOT = path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.UPLOADS_DIR ?? ".uploads");

// Keys look like submissions/<homeworkId>/<studentId>/<random>.<ext>; anything else is rejected
// before it can touch the filesystem.
const KEY_PATTERN = /^submissions\/[a-z0-9]+\/[a-z0-9]+\/[A-Za-z0-9_-]+\.[a-z0-9]+$/;

export function isValidKey(key: string) {
  return KEY_PATTERN.test(key);
}

function localPath(key: string) {
  if (!isValidKey(key)) throw new Error("Invalid storage key");
  return path.join(LOCAL_ROOT, key);
}

export async function createUploadToken(key: string, contentType: string, maxBytes: number) {
  return generateClientTokenFromReadWriteToken({
    pathname: key,
    allowedContentTypes: [contentType],
    maximumSizeInBytes: maxBytes,
    validUntil: Date.now() + 10 * 60 * 1000,
  });
}

export async function writeLocalObject(key: string, data: Uint8Array) {
  const file = localPath(key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, data, { flag: "wx" });
}

// Size of a stored object, or null if it doesn't exist.
export async function objectSize(key: string): Promise<number | null> {
  try {
    if (storageDriver() === "blob") return (await head(key)).size;
    return (await stat(localPath(key))).size;
  } catch {
    return null;
  }
}

export async function readObject(key: string): Promise<ReadableStream<Uint8Array> | null> {
  if (storageDriver() === "blob") {
    const result = await get(key, { access: "private" });
    return result?.statusCode === 200 ? result.stream : null;
  }
  try {
    await stat(localPath(key));
    return Readable.toWeb(createReadStream(localPath(key))) as ReadableStream<Uint8Array>;
  } catch {
    return null;
  }
}

// The first bytes of a stored object, for checking what it really is.
export async function readObjectStart(key: string, length = 512) {
  const stream = await readObject(key);
  if (!stream) return null;
  const reader = stream.getReader();
  const { value } = await reader.read();
  await reader.cancel();
  return (value ?? new Uint8Array()).subarray(0, length);
}

export type StoredObject = { key: string; uploadedAt: Date };

// Every stored homework file, for the sweep of files no row points at. Blob listing is paginated; the
// page cap only bounds a runaway store, the sweep simply continues on the next run.
const MAX_LIST_PAGES = 50;
export async function listObjects(): Promise<StoredObject[]> {
  const found: StoredObject[] = [];
  if (storageDriver() === "blob") {
    let cursor: string | undefined;
    for (let page = 0; page < MAX_LIST_PAGES; page++) {
      const result = await list({ prefix: "submissions/", limit: 1000, cursor });
      for (const blob of result.blobs) if (isValidKey(blob.pathname)) found.push({ key: blob.pathname, uploadedAt: blob.uploadedAt });
      if (!result.hasMore) break;
      cursor = result.cursor;
    }
    return found;
  }
  async function walk(dir: string) {
    for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else {
        const key = path.relative(LOCAL_ROOT, full).split(path.sep).join("/");
        if (isValidKey(key)) found.push({ key, uploadedAt: (await stat(full)).mtime });
      }
    }
  }
  await walk(path.join(LOCAL_ROOT, "submissions"));
  return found;
}

export async function deleteObject(key: string) {
  if (storageDriver() === "blob") await del(key);
  else await rm(localPath(key), { force: true });
}
