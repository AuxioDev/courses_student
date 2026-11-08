import "server-only";
import { createReadStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { del, get, head } from "@vercel/blob";
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";

// Homework files live in a private Vercel Blob store in production. Without
// BLOB_READ_WRITE_TOKEN (local development) they go to ./.uploads instead.

export type Driver = "blob" | "local";

export function storageDriver(): Driver {
  if (process.env.BLOB_READ_WRITE_TOKEN) return "blob";
  if (process.env.VERCEL) throw new Error("BLOB_READ_WRITE_TOKEN is required on Vercel");
  return "local";
}

const LOCAL_ROOT = path.join(process.cwd(), ".uploads");

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

export async function deleteObject(key: string) {
  if (storageDriver() === "blob") await del(key);
  else await rm(localPath(key), { force: true });
}
