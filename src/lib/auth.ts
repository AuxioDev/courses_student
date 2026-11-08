import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { db } from "./db";
import { getSession } from "./session";
import { getRequestLocale } from "@/i18n";
import { hasLocale, localePath, type Locale } from "@/i18n/config";
import { PRIVACY_VERSION } from "./privacy";

export type Student = {
  id: string;
  name: string;
  email: string;
  timezone: string;
  locale: Locale | null;
  sessionVersion: number;
  mustChangePassword: boolean;
  privacyAccepted: boolean;
  deletionRequestedAt: Date | null;
};

async function goTo(path: string): Promise<never> {
  redirect(localePath(await getRequestLocale(), path));
}

// Verifies the session against the database: right role, still active, and not
// signed out everywhere since the cookie was issued.
const loadStudent = cache(async (): Promise<Student | null> => {
  const session = await getSession();
  if (!session || session.role !== "student") return null;

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      name: true,
      email: true,
      timezone: true,
      locale: true,
      role: true,
      active: true,
      sessionVersion: true,
      mustChangePassword: true,
      privacyVersion: true,
      deletionRequestedAt: true,
    },
  });
  if (!user || user.role !== "student" || !user.active || user.sessionVersion !== session.v) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    timezone: user.timezone,
    locale: hasLocale(user.locale) ? user.locale : null,
    sessionVersion: user.sessionVersion,
    mustChangePassword: user.mustChangePassword,
    privacyAccepted: user.privacyVersion === PRIVACY_VERSION,
    deletionRequestedAt: user.deletionRequestedAt,
  };
});

// Every diary page and action. A student with a temporary password is sent to set
// their own before they can use anything else.
export async function getCurrentStudent(): Promise<Student> {
  const student = await loadStudent();
  if (!student) return goTo("/login?expired=1");
  if (student.mustChangePassword) return goTo("/change-password");
  if (!student.privacyAccepted) return goTo("/privacy/accept");
  return student;
}

// For Route Handlers, which answer 401 instead of redirecting.
export async function getStudentOrNull(): Promise<Student | null> {
  const student = await loadStudent();
  return student && !student.mustChangePassword && student.privacyAccepted ? student : null;
}

// Only for the page and action that accept the privacy notice.
export async function getStudentForConsent(): Promise<Student> {
  const student = await loadStudent();
  if (!student) return goTo("/login?expired=1");
  if (student.mustChangePassword) return goTo("/change-password");
  return student;
}

// Only for the change-password page and action.
export async function getStudentForPasswordChange(): Promise<Student> {
  const student = await loadStudent();
  if (!student) return goTo("/login?expired=1");
  return student;
}
