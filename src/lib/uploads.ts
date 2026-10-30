import "server-only";
import { randomBytes } from "node:crypto";
import { db } from "./db";
import { MAX_FILE_BYTES, MAX_FILES_PER_HOMEWORK, contentTypeFor, extensionOf, type UploadErrorCode } from "./upload-policy";

// Checks shared by every upload step: the homework is the student's, its term is
// open, and their submission isn't graded yet.
export async function checkCanUpload(
  studentId: string,
  homeworkId: string,
): Promise<"homeworkNotFound" | "termLocked" | "alreadyGraded" | null> {
  const homework = await db.homework.findFirst({
    where: { id: homeworkId, group: { enrollments: { some: { studentId, status: "active" } } } },
    select: { group: { select: { term: { select: { locked: true } } } } },
  });
  if (!homework) return "homeworkNotFound";
  if (homework.group.term.locked) return "termLocked";
  const submission = await db.submission.findUnique({
    where: { homeworkId_studentId: { homeworkId, studentId } },
    select: { status: true },
  });
  if (submission?.status === "graded") return "alreadyGraded";
  return null;
}

// Files the next hand-in would carry: new uploads plus those kept from the latest attempt.
export async function filesForNextAttempt(studentId: string, homeworkId: string) {
  const latest = await latestAttempt(studentId, homeworkId);
  const [pending, kept] = await Promise.all([
    db.submissionFile.count({ where: { studentId, homeworkId, attemptId: null } }),
    latest ? db.submissionFile.count({ where: { attemptId: latest.id } }) : 0,
  ]);
  return pending + kept;
}

export function latestAttempt(studentId: string, homeworkId: string) {
  return db.submissionAttempt.findFirst({
    where: { submission: { homeworkId, studentId } },
    orderBy: { number: "desc" },
    select: { id: true, number: true },
  });
}

export async function checkNewFile(
  studentId: string,
  homeworkId: string,
  name: string,
  size: number,
): Promise<UploadErrorCode | null> {
  if (!contentTypeFor(name)) return "fileType";
  if (!Number.isFinite(size) || size <= 0 || size > MAX_FILE_BYTES) return "fileTooBig";
  if ((await filesForNextAttempt(studentId, homeworkId)) >= MAX_FILES_PER_HOMEWORK) return "tooManyFiles";
  return checkCanUpload(studentId, homeworkId);
}

export function newStorageKey(studentId: string, homeworkId: string, name: string) {
  return `submissions/${homeworkId}/${studentId}/${randomBytes(16).toString("base64url")}.${extensionOf(name)}`;
}

// A key may only be used by the student and homework it was issued for.
export function keyBelongsTo(key: string, studentId: string, homeworkId: string) {
  return key.startsWith(`submissions/${homeworkId}/${studentId}/`);
}

// Keep the original name for display, minus path parts and control characters.
export function cleanFileName(name: string) {
  return (
    name
      .split(/[\\/]/)
      .pop()!
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .slice(0, 200) || "file"
  );
}
