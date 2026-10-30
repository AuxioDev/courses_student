"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { createSession, deleteSession } from "@/lib/session";
import { getCurrentStudent, getStudentForPasswordChange } from "@/lib/auth";
import { hashPassword, hashToken, newPasswordSchema, verifyPassword } from "@/lib/passwords";
import { clientIp, isLoginBlocked, recordLoginAttempt } from "@/lib/rate-limit";
import { sendResetLink } from "@/lib/password-reset";
import { NOTIFICATION_TYPES } from "@/lib/notifications/types";
import { deleteObject, isValidKey, objectSize } from "@/lib/storage";
import { MAX_FILES_PER_HOMEWORK, contentTypeFor, extensionOf, type UploadErrorCode } from "@/lib/upload-policy";
import { checkCanUpload, checkNewFile, cleanFileName, keyBelongsTo, latestAttempt } from "@/lib/uploads";
import { isDayKey } from "@/lib/dates";
import { getRequestLocale } from "@/i18n";
import { hasLocale, LOCALE_COOKIE, localePath } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/en";

// Messages are keys into the dictionary so the client can show them in the current language.
export type FormState =
  | { error?: keyof Dictionary["errors"]; ok?: keyof Dictionary["ok"]; email?: string }
  | undefined;

// ---------- Auth ----------

const loginSchema = z.object({
  email: z.email().transform((e) => e.toLowerCase().trim()),
  password: z.string().min(1),
});

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  const email = String(formData.get("email") ?? "");
  if (!parsed.success) return { error: "missingCredentials", email };

  const ip = await clientIp();
  if (await isLoginBlocked(parsed.data.email, ip)) return { error: "tooManyAttempts", email };

  const user = await db.user.findUnique({ where: { email: parsed.data.email } });
  // Always run bcrypt so a missing email takes as long as a wrong password.
  const valid = await verifyPassword(parsed.data.password, user?.passwordHash);
  if (!user || !valid || !user.active) {
    await recordLoginAttempt(parsed.data.email, ip, false);
    return { error: "wrongCredentials", email };
  }
  await recordLoginAttempt(parsed.data.email, ip, true);
  if (user.role !== "student") return { error: "notStudent", email };

  await createSession({ userId: user.id, role: user.role, v: user.sessionVersion });
  // The saved language follows the student across devices; the first login saves
  // whatever language they are using now.
  const current = await getRequestLocale();
  const locale = hasLocale(user.locale) ? user.locale : current;
  if (!user.locale) await db.user.update({ where: { id: user.id }, data: { locale } });
  redirect(localePath(locale, user.mustChangePassword ? "/change-password" : "/"));
}

export async function logout() {
  await deleteSession();
  redirect(localePath(await getRequestLocale(), "/login"));
}

// Bumping sessionVersion invalidates every cookie issued before now.
export async function logoutEverywhere() {
  const student = await getCurrentStudent();
  await db.$transaction([
    db.user.update({ where: { id: student.id }, data: { sessionVersion: { increment: 1 } } }),
    // Signed-out devices must stop getting this student's notifications.
    db.pushSubscription.deleteMany({ where: { userId: student.id } }),
  ]);
  await deleteSession();
  redirect(localePath(await getRequestLocale(), "/login"));
}

function readNewPassword(formData: FormData): { password: string } | { error: "passwordTooShort" | "passwordMismatch" } {
  const password = String(formData.get("newPassword") ?? "");
  if (!newPasswordSchema.safeParse(password).success) return { error: "passwordTooShort" };
  if (password !== formData.get("confirmPassword")) return { error: "passwordMismatch" };
  return { password };
}

// Sets a new password, signs out every other device and keeps this one signed in.
async function setPassword(userId: string, password: string) {
  const user = await db.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(password), mustChangePassword: false, sessionVersion: { increment: 1 } },
  });
  await createSession({ userId: user.id, role: user.role, v: user.sessionVersion });
}

export async function changePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const student = await getStudentForPasswordChange();
  const user = await db.user.findUniqueOrThrow({ where: { id: student.id }, select: { passwordHash: true } });
  const current = String(formData.get("currentPassword") ?? "");
  if (!(await verifyPassword(current, user.passwordHash))) return { error: "wrongCurrentPassword" };

  const next = readNewPassword(formData);
  if ("error" in next) return { error: next.error };
  if (next.password === current) return { error: "samePassword" };

  await setPassword(student.id, next.password);
  if (student.mustChangePassword) redirect(localePath(await getRequestLocale(), "/"));
  refresh();
  return { ok: "passwordChanged" };
}

const forgotSchema = z.object({ email: z.email().transform((e) => e.toLowerCase().trim()) });

// Always gives the same answer, whether or not the email is registered.
export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = forgotSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: "missingCredentials" };

  // Counted with the login attempts, so one IP can't send endless reset emails.
  const ip = await clientIp();
  const key = `reset:${parsed.data.email}`;
  if (await isLoginBlocked(key, ip)) return { error: "tooManyAttempts" };
  await recordLoginAttempt(key, ip, false);

  await sendResetLink(parsed.data.email);
  return { ok: "resetSent" };
}

// Links come from scripts/reset-link.ts (an admin runs it) until email arrives in Step 6.
export async function resetPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const tokenHash = hashToken(String(formData.get("token") ?? ""));
  const record = await db.authToken.findUnique({ where: { tokenHash }, include: { user: true } });
  if (!record || record.type !== "reset" || record.usedAt || record.expiresAt < new Date() || !record.user.active) {
    return { error: "resetLinkInvalid" };
  }
  if (record.user.role !== "student") return { error: "notStudent" };

  const next = readNewPassword(formData);
  if ("error" in next) return { error: next.error };

  // Claim the token first so the same link can't be used twice at once.
  const claimed = await db.authToken.updateMany({ where: { id: record.id, usedAt: null }, data: { usedAt: new Date() } });
  if (claimed.count === 0) return { error: "resetLinkInvalid" };

  await setPassword(record.userId, next.password);
  const locale = hasLocale(record.user.locale) ? record.user.locale : await getRequestLocale();
  redirect(localePath(locale, "/"));
}

// ---------- Homework ----------

const submissionSchema = z.object({
  homeworkId: z.string().min(1),
  content: z.string().trim().max(20_000),
  links: z
    .string()
    .trim()
    .transform((s) => s.split(/\s+/).filter(Boolean))
    .pipe(z.array(z.url({ protocol: /^https?$/ })).max(10)),
});

export async function submitHomework(_prev: FormState, formData: FormData): Promise<FormState> {
  const student = await getCurrentStudent();
  const parsed = submissionSchema.safeParse({
    homeworkId: formData.get("homeworkId"),
    content: formData.get("content") ?? "",
    links: formData.get("links") ?? "",
  });
  if (!parsed.success) return { error: "badLinks" };
  const { homeworkId, content, links } = parsed.data;
  const keepFiles = formData.get("keepFiles") === "on";

  const problem = await checkCanUpload(student.id, homeworkId);
  if (problem) return { error: problem };

  const homework = await db.homework.findUniqueOrThrow({ where: { id: homeworkId }, select: { dueAt: true } });
  const existing = await db.submission.findUnique({
    where: { homeworkId_studentId: { homeworkId, studentId: student.id } },
    select: { status: true },
  });
  const previous = await latestAttempt(student.id, homeworkId);
  const keptFiles = keepFiles && previous ? await db.submissionFile.findMany({ where: { attemptId: previous.id } }) : [];
  const newFiles = await db.submissionFile.count({ where: { homeworkId, studentId: student.id, attemptId: null } });
  if (!content && links.length === 0 && newFiles + keptFiles.length === 0) return { error: "emptySubmission" };
  if (newFiles + keptFiles.length > MAX_FILES_PER_HOMEWORK) return { error: "tooManyFiles" };

  const now = new Date();
  // Only the first hand-in is measured against the deadline: work the teacher
  // returned for revision is never late.
  const late = existing?.status !== "returned" && now > homework.dueAt;
  const status = late ? "late" : "submitted";

  await db.$transaction(async (tx) => {
    const submission = await tx.submission.upsert({
      where: { homeworkId_studentId: { homeworkId, studentId: student.id } },
      create: { homeworkId, studentId: student.id, content, links, status, submittedAt: now },
      update: { content, links, status, submittedAt: now, score: null, feedback: null },
    });
    const attempt = await tx.submissionAttempt.create({
      data: { submissionId: submission.id, number: (previous?.number ?? 0) + 1, content, links, late, submittedAt: now },
    });
    // New uploads are handed in with this attempt; kept files are listed again.
    await tx.submissionFile.updateMany({
      where: { homeworkId, studentId: student.id, attemptId: null },
      data: { attemptId: attempt.id },
    });
    if (keptFiles.length > 0) {
      await tx.submissionFile.createMany({
        data: keptFiles.map((f) => ({
          homeworkId: f.homeworkId,
          studentId: f.studentId,
          name: f.name,
          size: f.size,
          contentType: f.contentType,
          storageKey: f.storageKey,
          attemptId: attempt.id,
        })),
      });
    }
  });

  refresh();
  return { ok: late ? "submittedLate" : "submitted" };
}

// Step 2 of an upload (after the browser has stored the file): check what was
// actually stored and record it. Anything that fails the checks is deleted again.
export async function attachUpload(input: { homeworkId: string; key: string; name: string }): Promise<{ error?: UploadErrorCode }> {
  const student = await getCurrentStudent();
  const { homeworkId, key } = input;
  const name = cleanFileName(String(input.name ?? ""));
  const contentType = contentTypeFor(name);
  if (!isValidKey(key) || !keyBelongsTo(key, student.id, homeworkId) || !contentType || extensionOf(key) !== extensionOf(name)) {
    return { error: "uploadFailed" };
  }

  const size = await objectSize(key);
  if (size === null) return { error: "uploadFailed" };
  const problem = await checkNewFile(student.id, homeworkId, name, size);
  if (problem) {
    await deleteObject(key);
    return { error: problem };
  }

  await db.submissionFile.create({
    data: { homeworkId, studentId: student.id, name, size, contentType, storageKey: key },
  });
  refresh();
  return {};
}

export async function removeUpload(fileId: string): Promise<{ error?: UploadErrorCode }> {
  const student = await getCurrentStudent();
  // Handed-in files belong to their attempt and can't be removed.
  const file = await db.submissionFile.findFirst({ where: { id: String(fileId), studentId: student.id, attemptId: null } });
  if (!file) return { error: "uploadFailed" };
  const problem = await checkCanUpload(student.id, file.homeworkId);
  if (problem) return { error: problem };

  await db.submissionFile.delete({ where: { id: file.id } });
  if ((await db.submissionFile.count({ where: { storageKey: file.storageKey } })) === 0) {
    await deleteObject(file.storageKey);
  }
  refresh();
  return {};
}

// ---------- Notes ----------

const noteSchema = z.object({
  date: z.string().refine(isDayKey),
  text: z.string().trim().min(1).max(5_000),
});

export async function addNote(formData: FormData) {
  const student = await getCurrentStudent();
  const parsed = noteSchema.safeParse({ date: formData.get("date"), text: formData.get("text") });
  if (!parsed.success) return;
  await db.studentNote.create({
    data: { studentId: student.id, date: new Date(`${parsed.data.date}T00:00:00Z`), text: parsed.data.text },
  });
  refresh();
}

export async function deleteNote(formData: FormData) {
  const student = await getCurrentStudent();
  const id = String(formData.get("id") ?? "");
  await db.studentNote.deleteMany({ where: { id, studentId: student.id } });
  refresh();
}

// ---------- To-dos ----------

const todoSchema = z.object({
  title: z.string().trim().min(1).max(300),
  dueAt: z
    .string()
    .optional()
    .transform((s) => (s && isDayKey(s) ? new Date(`${s}T00:00:00Z`) : null)),
});

export async function addTodo(formData: FormData) {
  const student = await getCurrentStudent();
  const parsed = todoSchema.safeParse({
    title: formData.get("title"),
    dueAt: formData.get("dueAt") || undefined,
  });
  if (!parsed.success) return;
  await db.studentTodo.create({ data: { studentId: student.id, ...parsed.data } });
  refresh();
}

export async function toggleTodo(formData: FormData) {
  const student = await getCurrentStudent();
  const id = String(formData.get("id") ?? "");
  const todo = await db.studentTodo.findFirst({ where: { id, studentId: student.id } });
  if (!todo) return;
  await db.studentTodo.update({ where: { id }, data: { done: !todo.done } });
  refresh();
}

export async function deleteTodo(formData: FormData) {
  const student = await getCurrentStudent();
  const id = String(formData.get("id") ?? "");
  await db.studentTodo.deleteMany({ where: { id, studentId: student.id } });
  refresh();
}

// ---------- Notifications ----------

export async function updateNotificationPreferences(_prev: FormState, formData: FormData): Promise<FormState> {
  const student = await getCurrentStudent();
  await db.$transaction(
    NOTIFICATION_TYPES.map((type) => {
      const choice = { email: formData.get(`email:${type}`) === "on", push: formData.get(`push:${type}`) === "on" };
      return db.notificationPreference.upsert({
        where: { userId_type: { userId: student.id, type } },
        create: { userId: student.id, type, ...choice },
        update: choice,
      });
    }),
  );
  refresh();
  return { ok: "emailSaved" };
}

const pushSubscriptionSchema = z.object({
  endpoint: z.url({ protocol: /^https$/ }).max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

// Called by the browser after the student allowed notifications on this device.
export async function savePushSubscription(subscription: unknown): Promise<{ ok: boolean }> {
  const student = await getCurrentStudent();
  const parsed = pushSubscriptionSchema.safeParse(subscription);
  if (!parsed.success) return { ok: false };
  const { endpoint, keys } = parsed.data;
  // An endpoint belongs to one browser; if someone else used it before, it's now this student's.
  await db.pushSubscription.upsert({
    where: { endpoint },
    create: { userId: student.id, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    update: { userId: student.id, p256dh: keys.p256dh, auth: keys.auth },
  });
  return { ok: true };
}

export async function removePushSubscription(endpoint: string) {
  const student = await getCurrentStudent();
  await db.pushSubscription.deleteMany({ where: { endpoint: String(endpoint), userId: student.id } });
}

export async function markAllNotificationsRead() {
  const student = await getCurrentStudent();
  await db.notification.updateMany({
    where: { userId: student.id, readAt: null },
    data: { readAt: new Date() },
  });
  refresh();
}

// ---------- Profile ----------

export async function updateTimezone(_prev: FormState, formData: FormData): Promise<FormState> {
  const student = await getCurrentStudent();
  const timezone = String(formData.get("timezone") ?? "");
  if (!Intl.supportedValuesOf("timeZone").includes(timezone) && timezone !== "UTC") {
    return { error: "badTimezone" };
  }
  await db.user.update({ where: { id: student.id }, data: { timezone } });
  refresh();
  return { ok: "timezoneSaved" };
}

export async function updateLocale(formData: FormData) {
  const student = await getCurrentStudent();
  const locale = formData.get("locale");
  if (!hasLocale(locale)) return;
  await db.user.update({ where: { id: student.id }, data: { locale } });
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  redirect(localePath(locale, "/profile"));
}
