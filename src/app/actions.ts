"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { db } from "@/lib/db";
import { createSession, deleteSession } from "@/lib/session";
import { getCurrentStudent } from "@/lib/auth";
import { isDayKey } from "@/lib/dates";

export type FormState = { error?: string; ok?: string } | undefined;

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
  if (!parsed.success) return { error: "Enter your email and password." };

  const user = await db.user.findUnique({ where: { email: parsed.data.email } });
  const valid = user && (await bcrypt.compare(parsed.data.password, user.passwordHash));
  if (!user || !valid || !user.active) return { error: "Wrong email or password." };
  if (user.role !== "student") {
    return { error: "This app is for students. Teachers and admins have their own apps." };
  }

  await createSession({ userId: user.id, role: user.role });
  redirect("/");
}

export async function logout() {
  await deleteSession();
  redirect("/login");
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
  if (!parsed.success) return { error: "Links must be full http(s) addresses, one per line." };
  const { homeworkId, content, links } = parsed.data;
  if (!content && links.length === 0) return { error: "Write an answer or add a link." };

  const homework = await db.homework.findFirst({
    where: {
      id: homeworkId,
      group: { enrollments: { some: { studentId: student.id, status: "active" } } },
    },
    include: { group: { select: { term: { select: { locked: true } } } } },
  });
  if (!homework) return { error: "Homework not found." };
  if (homework.group.term.locked) return { error: "This term is locked." };

  const existing = await db.submission.findUnique({
    where: { homeworkId_studentId: { homeworkId, studentId: student.id } },
  });
  if (existing?.status === "graded") return { error: "This homework is already graded." };

  const now = new Date();
  const status = now > homework.dueAt ? "late" : "submitted";
  await db.submission.upsert({
    where: { homeworkId_studentId: { homeworkId, studentId: student.id } },
    create: { homeworkId, studentId: student.id, content, files: links, status, submittedAt: now },
    update: { content, files: links, status, submittedAt: now, score: null },
  });

  refresh();
  return { ok: status === "late" ? "Submitted (after the deadline)." : "Submitted." };
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
    return { error: "Unknown timezone." };
  }
  await db.user.update({ where: { id: student.id }, data: { timezone } });
  refresh();
  return { ok: "Timezone saved." };
}
