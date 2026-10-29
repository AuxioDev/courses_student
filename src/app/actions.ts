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
  await db.user.update({ where: { id: student.id }, data: { sessionVersion: { increment: 1 } } });
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
  if (!content && links.length === 0) return { error: "emptySubmission" };

  const homework = await db.homework.findFirst({
    where: {
      id: homeworkId,
      group: { enrollments: { some: { studentId: student.id, status: "active" } } },
    },
    include: { group: { select: { term: { select: { locked: true } } } } },
  });
  if (!homework) return { error: "homeworkNotFound" };
  if (homework.group.term.locked) return { error: "termLocked" };

  const existing = await db.submission.findUnique({
    where: { homeworkId_studentId: { homeworkId, studentId: student.id } },
  });
  if (existing?.status === "graded") return { error: "alreadyGraded" };

  const now = new Date();
  const status = now > homework.dueAt ? "late" : "submitted";
  await db.submission.upsert({
    where: { homeworkId_studentId: { homeworkId, studentId: student.id } },
    create: { homeworkId, studentId: student.id, content, files: links, status, submittedAt: now },
    update: { content, files: links, status, submittedAt: now, score: null },
  });

  refresh();
  return { ok: status === "late" ? "submittedLate" : "submitted" };
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
