import "server-only";
import { mapConcurrent } from "./concurrency";
import { db } from "./db";
import { deleteObject, listObjects } from "./storage";

// A file is attached within seconds of being uploaded (the token is valid for 10 minutes), so one that is a day
// old and still has no row is abandoned: an upload that was never attached, a student whose files were erased
// but whose storage delete failed, or a copy made directly with a token.
export const ORPHAN_AFTER_MS = 24 * 60 * 60 * 1000;
// Bounds one run; the rest goes on the next.
export const MAX_ORPHAN_DELETIONS = 500;

const CHUNK = 1000;

export async function sweepOrphanUploads(now = new Date()) {
  const old = (await listObjects()).filter((o) => now.getTime() - o.uploadedAt.getTime() >= ORPHAN_AFTER_MS);

  const referenced = new Set<string>();
  for (let i = 0; i < old.length; i += CHUNK) {
    const keys = old.slice(i, i + CHUNK).map((o) => o.key);
    const rows = await db.submissionFile.findMany({ where: { storageKey: { in: keys } }, select: { storageKey: true } });
    for (const row of rows) referenced.add(row.storageKey);
  }

  const orphans = old.filter((o) => !referenced.has(o.key));
  const batch = orphans.slice(0, MAX_ORPHAN_DELETIONS);
  const outcomes = await mapConcurrent(batch, 5, (o) => deleteObject(o.key));
  const failed = outcomes.filter((o) => o.status === "rejected").length;
  if (failed > 0) console.error(`[uploads] ${failed} orphaned file(s) could not be deleted`);
  return { orphaned: orphans.length, deleted: batch.length - failed, failed };
}
