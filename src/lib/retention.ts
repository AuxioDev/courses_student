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

const DAY_MS = 24 * 60 * 60 * 1000;
// Applications from the public website hold a stranger's phone and email. A rejected one goes
// after 90 days, one nobody answered after 180, and an approved one after a year: by then the
// student's account is the record. The public site's privacy page states these periods.
export const APPLICATION_RETENTION_DAYS = { rejected: 90, open: 180, approved: 365 } as const;

async function eraseOldApplications(now: Date) {
  const before = (days: number) => new Date(now.getTime() - days * DAY_MS);
  const { count } = await db.application.deleteMany({
    where: {
      OR: [
        { status: "rejected", handledAt: { lte: before(APPLICATION_RETENTION_DAYS.rejected) } },
        { status: { in: ["new", "contacted"] }, createdAt: { lte: before(APPLICATION_RETENTION_DAYS.open) } },
        { status: "approved", handledAt: { lte: before(APPLICATION_RETENTION_DAYS.approved) } },
      ],
    },
  });
  return count;
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
  return { erased: due.length, applications: await eraseOldApplications(now) };
}
