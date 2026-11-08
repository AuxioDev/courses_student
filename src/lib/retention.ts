import "server-only";
import { db } from "./db";
import { RETENTION_MS } from "./privacy";
import { deleteObject } from "./storage";

// Erases a student's private data: notes, to-dos, uploaded files, notifications
// and device data. School records (marks, attendance, final grades, submissions) stay.
async function erasePrivateData(userId: string) {
  const files = await db.submissionFile.findMany({ where: { studentId: userId }, select: { storageKey: true } });
  await db.$transaction([
    db.studentNote.deleteMany({ where: { studentId: userId } }),
    db.studentTodo.deleteMany({ where: { studentId: userId } }),
    db.submissionFile.deleteMany({ where: { studentId: userId } }),
    db.notification.deleteMany({ where: { userId } }),
    db.notificationPreference.deleteMany({ where: { userId } }),
    db.pushSubscription.deleteMany({ where: { userId } }),
    db.authToken.deleteMany({ where: { userId } }),
    db.user.update({ where: { id: userId }, data: { privateDataErasedAt: new Date() } }),
  ]);
  // Stored after the rows are gone, so a failure can't leave a row pointing at nothing.
  for (const key of new Set(files.map((f) => f.storageKey))) await deleteObject(key);
}

export async function runRetention(now = new Date()) {
  // Accounts deactivated without a date (e.g. directly in the database) start their year now.
  await db.user.updateMany({
    where: { role: "student", active: false, deactivatedAt: null },
    data: { deactivatedAt: now },
  });
  const due = await db.user.findMany({
    where: {
      role: "student",
      privateDataErasedAt: null,
      OR: [{ deletionApprovedAt: { not: null } }, { active: false, deactivatedAt: { lte: new Date(now.getTime() - RETENTION_MS) } }],
    },
    select: { id: true },
  });
  for (const { id } of due) await erasePrivateData(id);
  return { erased: due.length };
}
