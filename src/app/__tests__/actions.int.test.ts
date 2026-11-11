// Runs the real Student server actions against a throwaway database. Only the framework edges are faked: who is
// signed in, the session cookie, redirect(), the browser's cookies and headers, file storage, and the reset email.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  signedIn: true,
  studentId: "",
  mustChange: false,
  ip: "",
  sessions: [] as { userId: string; role: string; v: number }[],
  signedOut: 0,
  cookies: new Map<string, string>(),
  resetEmails: [] as string[],
  sizes: new Map<string, number>(),
  starts: new Map<string, Uint8Array>(),
  deleted: [] as string[],
}));

const NOT_STUDENT = "SENTINEL_NOT_STUDENT";
vi.mock("@/lib/auth", () => {
  const student = (mustChangePassword = false) => {
    if (!state.signedIn) throw new Error(NOT_STUDENT);
    return { id: state.studentId, name: "S", email: "s@x", timezone: "Asia/Baku", locale: "en", mustChangePassword };
  };
  return {
    getCurrentStudent: async () => student(),
    getStudentForConsent: async () => student(),
    getStudentForPasswordChange: async () => student(state.mustChange),
    getStudentOrNull: vi.fn(),
  };
});
vi.mock("@/lib/session", () => ({
  createSession: vi.fn(async (payload: { userId: string; role: string; v: number }) => void state.sessions.push(payload)),
  deleteSession: vi.fn(async () => void state.signedOut++),
  getSession: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  },
}));
vi.mock("next/cache", () => ({ refresh: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (state.cookies.has(name) ? { value: state.cookies.get(name) } : undefined),
    set: (name: string, value: string) => void state.cookies.set(name, value),
    delete: (name: string) => void state.cookies.delete(name),
  }),
  headers: async () => new Headers(state.ip ? { "x-real-ip": state.ip } : {}),
}));
vi.mock("@/i18n", () => ({ getRequestLocale: async () => "en" }));
vi.mock("@/lib/password-reset", () => ({ sendResetLink: vi.fn(async (email: string) => void state.resetEmails.push(email)) }));
vi.mock("@/lib/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/storage")>();
  return {
    ...actual,
    objectSize: vi.fn(async (key: string) => state.sizes.get(key) ?? null),
    readObjectStart: vi.fn(async (key: string) => state.starts.get(key) ?? null),
    deleteObject: vi.fn(async (key: string) => void state.deleted.push(key)),
  };
});

import { db } from "@/lib/db";
import { hashPassword, hashToken, verifyPassword } from "@/lib/passwords";
import { PRIVACY_VERSION } from "@/lib/privacy";
import { NOTIFICATION_TYPES } from "@/lib/notifications/types";
import { MAX_FILES_PER_HOMEWORK } from "@/lib/upload-policy";
import { newStorageKey } from "@/lib/uploads";
import { createWorld, resetDatabase } from "../../../test/db";
import * as actions from "../actions";

const PASSWORD = "correct horse battery";
const HASH = await hashPassword(PASSWORD);
const HOUR = 3_600_000;
const PDF = new TextEncoder().encode("%PDF-1.7\n% a real header\n");

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const redirectsTo = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    const m = /^NEXT_REDIRECT:(.*)$/.exec((e as Error).message);
    if (m) return m[1];
    throw e;
  }
  return null;
};

let n = 0;
async function account(role: "student" | "teacher" | "admin" = "student", extra: Record<string, unknown> = {}) {
  const email = `person${++n}@t.local`;
  const user = await db.user.create({ data: { name: role, email, passwordHash: HASH, role, ...extra } });
  return { user, email };
}

// A student who is in a group with one homework, and is the signed-in student.
async function setup() {
  const w = await createWorld();
  await db.user.update({ where: { id: w.student.id }, data: { passwordHash: HASH } });
  state.studentId = w.student.id;
  return w;
}

beforeEach(async () => {
  await resetDatabase();
  state.signedIn = true;
  state.mustChange = false;
  state.ip = "10.0.0.1";
  state.sessions.length = 0;
  state.signedOut = 0;
  state.cookies.clear();
  state.resetEmails.length = 0;
  state.sizes.clear();
  state.starts.clear();
  state.deleted.length = 0;
});
afterAll(() => db.$disconnect());

describe("login", () => {
  const attempt = (email: string, password = PASSWORD, extra: Record<string, string> = {}) =>
    actions.login(undefined, form({ email, password, ...extra }));

  it("signs a student in, starts a session for that student and saves the language they used", async () => {
    const { user, email } = await account("student", { sessionVersion: 3 });
    expect(await redirectsTo(attempt(email))).toBe("/en");
    expect(state.sessions).toEqual([{ userId: user.id, role: "student", v: 3 }]);
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).locale).toBe("en");
  });

  it("uses the language already saved on the account", async () => {
    const { email } = await account("student", { locale: "ru" });
    expect(await redirectsTo(attempt(email))).toBe("/ru");
  });

  it("sends a student with a temporary password to choose their own", async () => {
    const { email } = await account("student", { mustChangePassword: true });
    expect(await redirectsTo(attempt(email))).toBe("/en/change-password");
  });

  it("returns to where the student was heading, but only inside this site", async () => {
    const { email } = await account("student");
    expect(await redirectsTo(attempt(email, PASSWORD, { next: "/homework/abc" }))).toBe("/en/homework/abc");
    for (const evil of ["https://evil.example/x", "//evil.example", "\\\\evil.example", "javascript:alert(1)"]) {
      expect(await redirectsTo(attempt(email, PASSWORD, { next: evil }))).toBe("/en");
    }
  });

  it("treats a wrong password, an unknown email and a deactivated account the same way", async () => {
    const { email } = await account("student");
    const gone = await account("student", { active: false });
    const answers = [await attempt(email, "wrong"), await attempt("nobody@t.local"), await attempt(gone.email)];
    expect(answers.map((a) => a?.error)).toEqual(["wrongCredentials", "wrongCredentials", "wrongCredentials"]);
    expect(state.sessions).toEqual([]);
    expect(await db.loginAttempt.count({ where: { success: false } })).toBe(3);
  });

  it("refuses a teacher's or an admin's account here, without starting a session", async () => {
    for (const role of ["teacher", "admin"] as const) {
      const { email } = await account(role);
      expect(await attempt(email)).toEqual({ error: "notStudent", email });
    }
    expect(state.sessions).toEqual([]);
  });

  it("refuses an expired temporary password with its own message, and counts it as a failure", async () => {
    const { email } = await account("student", { mustChangePassword: true, tempPasswordExpiresAt: new Date(Date.now() - HOUR) });
    expect(await attempt(email)).toEqual({ error: "tempPasswordExpired", email });
    expect(state.sessions).toEqual([]);
    expect(await db.loginAttempt.count({ where: { email, success: false } })).toBe(1);
  });

  it("answers missing or malformed input without touching the database", async () => {
    expect(await actions.login(undefined, form({ email: "", password: "x" }))).toMatchObject({ error: "missingCredentials" });
    expect(await actions.login(undefined, form({ email: "not-an-email", password: "x" }))).toMatchObject({ error: "missingCredentials" });
    expect(await actions.login(undefined, form({ email: "a@t.local", password: "" }))).toMatchObject({ error: "missingCredentials" });
    expect(await db.loginAttempt.count()).toBe(0);
  });

  it("ignores the case of the email", async () => {
    const { email } = await account("student");
    expect(await redirectsTo(attempt(`  ${email.toUpperCase()}`.trim()))).toBe("/en");
  });

  it("locks one address out after repeated failures, even for the right password, but not other addresses", async () => {
    const { email } = await account("student");
    for (let i = 0; i < 5; i++) await attempt(email, "wrong");
    expect(await attempt(email)).toEqual({ error: "tooManyAttempts", email });
    expect(state.sessions).toEqual([]);

    state.ip = "10.0.0.2"; // the owner, somewhere else
    expect(await redirectsTo(attempt(email))).toBe("/en");
  });
});

describe("logout", () => {
  it("ends the session and goes to the login page", async () => {
    await setup();
    expect(await redirectsTo(actions.logout())).toBe("/en/login");
    expect(state.signedOut).toBe(1);
  });

  it("signing out everywhere bumps the session version, drops the push devices and ends this session", async () => {
    const w = await setup();
    await db.pushSubscription.create({ data: { userId: w.student.id, endpoint: "https://fcm.googleapis.com/x", p256dh: "p", auth: "a" } });
    expect(await redirectsTo(actions.logoutEverywhere())).toBe("/en/login");
    expect((await db.user.findUniqueOrThrow({ where: { id: w.student.id } })).sessionVersion).toBe(w.student.sessionVersion + 1);
    expect(await db.pushSubscription.count()).toBe(0);
    expect(state.signedOut).toBe(1);
  });
});

describe("changePassword", () => {
  const change = (fields: Record<string, string>) => actions.changePassword(undefined, form(fields));
  const good = { currentPassword: PASSWORD, newPassword: "a brand new password", confirmPassword: "a brand new password" };

  it("changes the password, signs out other devices, clears the temporary-password marks and keeps this device in", async () => {
    const w = await setup();
    await db.user.update({ where: { id: w.student.id }, data: { mustChangePassword: true, tempPasswordExpiresAt: new Date(Date.now() + HOUR) } });
    await db.authToken.create({ data: { userId: w.student.id, type: "reset", tokenHash: "h1", expiresAt: new Date(Date.now() + HOUR) } });

    expect(await change(good)).toEqual({ ok: "passwordChanged" });
    const after = await db.user.findUniqueOrThrow({ where: { id: w.student.id } });
    expect(await verifyPassword("a brand new password", after.passwordHash)).toBe(true);
    expect(after).toMatchObject({ mustChangePassword: false, tempPasswordExpiresAt: null, sessionVersion: w.student.sessionVersion + 1 });
    expect(await db.authToken.count()).toBe(0); // a reset link still in an inbox no longer works
    expect(state.sessions).toEqual([{ userId: w.student.id, role: "student", v: after.sessionVersion }]);
  });

  it("goes to the start page after the forced change at first login", async () => {
    await setup();
    state.mustChange = true;
    expect(await redirectsTo(change(good))).toBe("/en");
  });

  it("refuses a wrong current password, a short or unmatched new one, and the same one again, and changes nothing", async () => {
    const w = await setup();
    expect(await change({ ...good, currentPassword: "nope" })).toEqual({ error: "wrongCurrentPassword" });
    expect(await change({ ...good, newPassword: "short", confirmPassword: "short" })).toEqual({ error: "passwordTooShort" });
    expect(await change({ ...good, confirmPassword: "something else entirely" })).toEqual({ error: "passwordMismatch" });
    expect(await change({ currentPassword: PASSWORD, newPassword: PASSWORD, confirmPassword: PASSWORD })).toEqual({ error: "samePassword" });
    const after = await db.user.findUniqueOrThrow({ where: { id: w.student.id } });
    expect(after.passwordHash).toBe(HASH);
    expect(state.sessions).toEqual([]);
  });
});

describe("password reset", () => {
  const request = (email: string) => actions.requestPasswordReset(undefined, form({ email }));
  const RAW = "a-long-random-reset-token";
  const reset = (fields: Record<string, string> = {}) =>
    actions.resetPassword(undefined, form({ token: RAW, newPassword: "a brand new password", confirmPassword: "a brand new password", ...fields }));
  const token = (userId: string, extra: Record<string, unknown> = {}) =>
    db.authToken.create({ data: { userId, type: "reset", tokenHash: hashToken(RAW), expiresAt: new Date(Date.now() + HOUR), ...extra } });

  it("answers the same whether or not the email is registered, and asks for the link by lowercase email", async () => {
    const { email } = await account("student");
    expect(await request(email.toUpperCase())).toEqual({ ok: "resetSent" });
    expect(await request("nobody@t.local")).toEqual({ ok: "resetSent" });
    expect(state.resetEmails).toEqual([email, "nobody@t.local"]);
  });

  it("rejects a malformed email and stops one address from asking over and over", async () => {
    expect(await request("nope")).toEqual({ error: "missingCredentials" });
    for (let i = 0; i < 5; i++) expect(await request("a@t.local")).toEqual({ ok: "resetSent" });
    expect(await request("a@t.local")).toEqual({ error: "tooManyAttempts" });
    expect(state.resetEmails).toHaveLength(5);
  });

  it("sets the new password, uses the link up, signs out other devices and signs this one in", async () => {
    const { user } = await account("student", { locale: "ru" });
    await token(user.id);
    expect(await redirectsTo(reset())).toBe("/ru");
    const after = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(await verifyPassword("a brand new password", after.passwordHash)).toBe(true);
    expect(after.sessionVersion).toBe(user.sessionVersion + 1);
    expect(state.sessions).toHaveLength(1);
  });

  it("refuses a link that was already used, has expired, is unknown, or belongs to a deactivated account", async () => {
    const { user } = await account("student");
    await token(user.id);
    await redirectsTo(reset()); // uses it up
    expect(await reset()).toEqual({ error: "resetLinkInvalid" });

    await db.authToken.deleteMany();
    await token(user.id, { expiresAt: new Date(Date.now() - 1000) });
    expect(await reset()).toEqual({ error: "resetLinkInvalid" });
    expect(await reset({ token: "something-else" })).toEqual({ error: "resetLinkInvalid" });

    await db.authToken.deleteMany();
    const gone = await account("student", { active: false });
    await token(gone.user.id);
    expect(await reset()).toEqual({ error: "resetLinkInvalid" });
  });

  it("does not use the link up when the new password is bad, so the person can try again", async () => {
    const { user } = await account("student");
    await token(user.id);
    expect(await reset({ newPassword: "short", confirmPassword: "short" })).toEqual({ error: "passwordTooShort" });
    expect(await reset({ confirmPassword: "different" })).toEqual({ error: "passwordMismatch" });
    expect((await db.authToken.findFirstOrThrow()).usedAt).toBeNull();
    expect(await redirectsTo(reset())).toBe("/en");
  });

  it("refuses a teacher's link here, and leaves it unused", async () => {
    const { user } = await account("teacher");
    await token(user.id);
    expect(await reset()).toEqual({ error: "notStudent" });
    expect((await db.authToken.findFirstOrThrow()).usedAt).toBeNull();
  });

  it("lets only one of two simultaneous uses of the same link through", async () => {
    const { user } = await account("student");
    await token(user.id);
    const results = await Promise.all([redirectsTo(reset()), redirectsTo(reset())].map((p) => p.then((r) => r ?? "error").catch(() => "error")));
    const winners = results.filter((r) => String(r).startsWith("/"));
    expect(winners).toHaveLength(1);
    expect(state.sessions).toHaveLength(1);
  });
});

describe("handing in homework", () => {
  const submit = (w: Awaited<ReturnType<typeof setup>>, fields: Record<string, string> = {}) =>
    actions.submitHomework(undefined, form({ homeworkId: w.homework.id, content: "my answer", links: "", ...fields }));
  const file = (w: Awaited<ReturnType<typeof setup>>, key: string, attemptId: string | null = null, studentId = w.student.id) =>
    db.submissionFile.create({
      data: { homeworkId: w.homework.id, studentId, attemptId, name: "a.pdf", size: 10, contentType: "application/pdf", storageKey: key },
    });

  it("records the first hand-in as attempt 1, on time", async () => {
    const w = await setup();
    expect(await submit(w)).toEqual({ ok: "submitted" });
    expect(await db.submission.findFirstOrThrow()).toMatchObject({ studentId: w.student.id, status: "submitted", content: "my answer" });
    expect(await db.submissionAttempt.findFirstOrThrow()).toMatchObject({ number: 1, late: false });
  });

  it("marks a hand-in after the deadline as late", async () => {
    const w = await setup();
    await db.homework.update({ where: { id: w.homework.id }, data: { dueAt: new Date(Date.now() - HOUR) } });
    expect(await submit(w)).toEqual({ ok: "submittedLate" });
    expect(await db.submission.findFirstOrThrow()).toMatchObject({ status: "late" });
    expect((await db.submissionAttempt.findFirstOrThrow()).late).toBe(true);
  });

  it("numbers a second hand-in as attempt 2 and replaces the answer, clearing any score", async () => {
    const w = await setup();
    await submit(w);
    await db.submission.updateMany({ data: { score: 5, feedback: "old" } });
    expect(await submit(w, { content: "better answer" })).toEqual({ ok: "submitted" });
    expect(await db.submissionAttempt.findMany({ orderBy: { number: "asc" } })).toMatchObject([{ number: 1 }, { number: 2, content: "better answer" }]);
    expect(await db.submission.findFirstOrThrow()).toMatchObject({ content: "better answer", score: null, feedback: null });
    expect(await db.submission.count()).toBe(1);
  });

  it("never counts work the teacher sent back for revision as late", async () => {
    const w = await setup();
    await submit(w);
    await db.submission.updateMany({ data: { status: "returned" } });
    await db.homework.update({ where: { id: w.homework.id }, data: { dueAt: new Date(Date.now() - 48 * HOUR) } });
    expect(await submit(w, { content: "revised" })).toEqual({ ok: "submitted" });
  });

  it("needs an answer, a link or a file, and only accepts http(s) links", async () => {
    const w = await setup();
    expect(await submit(w, { content: "   ", links: "" })).toEqual({ error: "emptySubmission" });
    for (const bad of ["ftp://x.example", "javascript:alert(1)", "not a link"]) {
      expect(await submit(w, { links: bad })).toEqual({ error: "badLinks" });
    }
    expect(await submit(w, { content: "", links: "https://a.example/x\nhttp://b.example" })).toEqual({ ok: "submitted" });
    expect((await db.submission.findFirstOrThrow()).links).toEqual(["https://a.example/x", "http://b.example"]);
    expect(await submit(w, { links: Array.from({ length: 11 }, (_, i) => `https://e.example/${i}`).join(" ") })).toEqual({ error: "badLinks" });
  });

  it("is refused for homework in a group the student is not in", async () => {
    const w = await setup();
    const stranger = await account("student");
    state.studentId = stranger.user.id;
    expect(await submit(w)).toEqual({ error: "homeworkNotFound" });
    expect(await db.submission.count()).toBe(0);
  });

  it("is refused once graded, and in a locked term", async () => {
    const w = await setup();
    await submit(w);
    await db.submission.updateMany({ data: { status: "graded", score: 18 } });
    expect(await submit(w, { content: "tampering" })).toEqual({ error: "alreadyGraded" });
    expect((await db.submission.findFirstOrThrow()).content).toBe("my answer");

    await db.submission.updateMany({ data: { status: "submitted" } });
    await db.term.update({ where: { id: w.term.id }, data: { locked: true } });
    expect(await submit(w)).toEqual({ error: "termLocked" });
  });

  it("hands in the files that were uploaded, and only that student's", async () => {
    const w = await setup();
    const stranger = await account("student");
    await file(w, "submissions/x/mine/1.pdf");
    await file(w, "submissions/x/theirs/2.pdf", null, stranger.user.id);
    await submit(w);
    const attempt = await db.submissionAttempt.findFirstOrThrow();
    expect(await db.submissionFile.findMany({ where: { attemptId: attempt.id } })).toMatchObject([{ storageKey: "submissions/x/mine/1.pdf" }]);
    expect((await db.submissionFile.findFirstOrThrow({ where: { studentId: stranger.user.id } })).attemptId).toBeNull();
  });

  it("can keep the previous attempt's files for the next one", async () => {
    const w = await setup();
    await file(w, "submissions/x/mine/1.pdf");
    await submit(w);
    expect(await submit(w, { content: "again", keepFiles: "on" })).toEqual({ ok: "submitted" });
    const second = await db.submissionAttempt.findFirstOrThrow({ where: { number: 2 } });
    expect(await db.submissionFile.count({ where: { attemptId: second.id } })).toBe(1);
    // Without the box ticked, the next attempt carries no files.
    expect(await submit(w, { content: "third" })).toEqual({ ok: "submitted" });
    const third = await db.submissionAttempt.findFirstOrThrow({ where: { number: 3 } });
    expect(await db.submissionFile.count({ where: { attemptId: third.id } })).toBe(0);
  });

  it(`allows at most ${MAX_FILES_PER_HOMEWORK} files`, async () => {
    const w = await setup();
    for (let i = 0; i <= MAX_FILES_PER_HOMEWORK; i++) await file(w, `submissions/x/mine/${i}.pdf`);
    expect(await submit(w)).toEqual({ error: "tooManyFiles" });
    expect(await db.submission.count()).toBe(0);
  });

  it("survives a double tap: one attempt, no error", async () => {
    const w = await setup();
    const results = await Promise.all([submit(w), submit(w)]);
    expect(results.every((r) => r?.ok === "submitted")).toBe(true);
    expect(await db.submission.count()).toBe(1);
    expect(await db.submissionAttempt.count()).toBe(1);
  });
});

describe("uploading a file", () => {
  const attach = (w: Awaited<ReturnType<typeof setup>>, key: string, name = "essay.pdf") =>
    actions.attachUpload({ homeworkId: w.homework.id, key, name });
  const stored = (key: string, size = 1000, start: Uint8Array = PDF) => {
    state.sizes.set(key, size);
    state.starts.set(key, start);
    return key;
  };

  it("records a file that is really what its name says, with the size that was actually stored", async () => {
    const w = await setup();
    const key = stored(newStorageKey(w.student.id, w.homework.id, "essay.pdf"), 4321);
    expect(await attach(w, key)).toEqual({});
    expect(await db.submissionFile.findFirstOrThrow()).toMatchObject({
      studentId: w.student.id,
      homeworkId: w.homework.id,
      name: "essay.pdf",
      size: 4321,
      contentType: "application/pdf",
      storageKey: key,
      attemptId: null,
    });
    expect(state.deleted).toEqual([]);
  });

  it("refuses a key that was issued to someone else or for another homework, and does not touch their file", async () => {
    const w = await setup();
    const stranger = await account("student");
    const theirs = stored(newStorageKey(stranger.user.id, w.homework.id, "essay.pdf"));
    const other = stored(newStorageKey(w.student.id, "someotherhomework", "essay.pdf"));
    expect(await attach(w, theirs)).toEqual({ error: "uploadFailed" });
    expect(await attach(w, other)).toEqual({ error: "uploadFailed" });
    expect(await attach(w, "../../etc/passwd")).toEqual({ error: "uploadFailed" });
    expect(await db.submissionFile.count()).toBe(0);
    expect(state.deleted).toEqual([]);
  });

  it("refuses a name whose type is not allowed, or does not match the key", async () => {
    const w = await setup();
    const key = stored(newStorageKey(w.student.id, w.homework.id, "essay.pdf"));
    expect(await attach(w, key, "essay.png")).toEqual({ error: "uploadFailed" }); // key says pdf
    expect(await attach(w, key, "virus.exe")).toEqual({ error: "uploadFailed" });
    expect(await db.submissionFile.count()).toBe(0);
  });

  it("refuses a key nothing was stored under", async () => {
    const w = await setup();
    expect(await attach(w, newStorageKey(w.student.id, w.homework.id, "essay.pdf"))).toEqual({ error: "uploadFailed" });
  });

  it("deletes a stored file whose bytes are not what its extension claims", async () => {
    const w = await setup();
    const key = stored(newStorageKey(w.student.id, w.homework.id, "essay.pdf"), 100, new TextEncoder().encode("<script>alert(1)</script>"));
    expect(await attach(w, key)).toEqual({ error: "fileType" });
    expect(await db.submissionFile.count()).toBe(0);
    expect(state.deleted).toEqual([key]);
  });

  it("deletes the stored file when the limit is reached, or the work is graded, or the term is locked", async () => {
    const w = await setup();
    for (let i = 0; i < MAX_FILES_PER_HOMEWORK; i++) {
      await db.submissionFile.create({ data: { homeworkId: w.homework.id, studentId: w.student.id, name: "a.pdf", size: 1, contentType: "application/pdf", storageKey: `submissions/${w.homework.id}/${w.student.id}/k${i}.pdf` } });
    }
    const key = stored(newStorageKey(w.student.id, w.homework.id, "extra.pdf"));
    expect(await attach(w, key)).toEqual({ error: "tooManyFiles" });
    expect(state.deleted).toContain(key);

    await db.submissionFile.deleteMany();
    await db.submission.create({ data: { homeworkId: w.homework.id, studentId: w.student.id, status: "graded", score: 1 } });
    const key2 = stored(newStorageKey(w.student.id, w.homework.id, "late.pdf"));
    expect(await attach(w, key2)).toEqual({ error: "alreadyGraded" });
    expect(state.deleted).toContain(key2);

    await db.submission.deleteMany();
    await db.term.update({ where: { id: w.term.id }, data: { locked: true } });
    const key3 = stored(newStorageKey(w.student.id, w.homework.id, "locked.pdf"));
    expect(await attach(w, key3)).toEqual({ error: "termLocked" });
    expect(state.deleted).toContain(key3);
  });
});

describe("removing an uploaded file", () => {
  async function pending(w: Awaited<ReturnType<typeof setup>>, key: string, extra: Record<string, unknown> = {}) {
    return db.submissionFile.create({
      data: { homeworkId: w.homework.id, studentId: w.student.id, name: "a.pdf", size: 1, contentType: "application/pdf", storageKey: key, ...extra },
    });
  }

  it("removes the student's own pending file and the stored copy", async () => {
    const w = await setup();
    const f = await pending(w, "submissions/h/s/own.pdf");
    expect(await actions.removeUpload(f.id)).toEqual({});
    expect(await db.submissionFile.count()).toBe(0);
    expect(state.deleted).toEqual(["submissions/h/s/own.pdf"]);
  });

  it("keeps the stored copy while another row (a kept attachment) still uses it", async () => {
    const w = await setup();
    const attempt = await db.submissionAttempt.create({
      data: { submission: { create: { homeworkId: w.homework.id, studentId: w.student.id } }, number: 1 },
    });
    await pending(w, "submissions/h/s/shared.pdf", { attemptId: attempt.id });
    const second = await pending(w, "submissions/h/s/shared.pdf");
    expect(await actions.removeUpload(second.id)).toEqual({});
    expect(state.deleted).toEqual([]);
    expect(await db.submissionFile.count()).toBe(1);
  });

  it("will not remove a file that was already handed in, or someone else's, or after grading", async () => {
    const w = await setup();
    const stranger = await account("student");
    const attempt = await db.submissionAttempt.create({
      data: { submission: { create: { homeworkId: w.homework.id, studentId: w.student.id } }, number: 1 },
    });
    const handedIn = await pending(w, "submissions/h/s/in.pdf", { attemptId: attempt.id });
    const theirs = await pending(w, "submissions/h/t/theirs.pdf", { studentId: stranger.user.id });
    expect(await actions.removeUpload(handedIn.id)).toEqual({ error: "uploadFailed" });
    expect(await actions.removeUpload(theirs.id)).toEqual({ error: "uploadFailed" });
    expect(await actions.removeUpload("does-not-exist")).toEqual({ error: "uploadFailed" });

    const own = await pending(w, "submissions/h/s/own.pdf");
    await db.submission.updateMany({ data: { status: "graded", score: 1 } });
    expect(await actions.removeUpload(own.id)).toEqual({ error: "alreadyGraded" });
    expect(await db.submissionFile.count()).toBe(3);
    expect(state.deleted).toEqual([]);
  });
});

describe("notes and to-dos", () => {
  it("adds a note on a day, trimmed", async () => {
    const w = await setup();
    await actions.addNote(form({ date: "2026-11-12", text: "  remember the book  " }));
    expect(await db.studentNote.findFirstOrThrow()).toMatchObject({ studentId: w.student.id, text: "remember the book" });
    expect((await db.studentNote.findFirstOrThrow()).date.toISOString()).toBe("2026-11-12T00:00:00.000Z");
  });

  it("ignores a note with a bad date or no text, and stops at the limit", async () => {
    const w = await setup();
    await actions.addNote(form({ date: "2026-02-30", text: "x" }));
    await actions.addNote(form({ date: "tomorrow", text: "x" }));
    await actions.addNote(form({ date: "2026-11-12", text: "   " }));
    await actions.addNote(form({ date: "2026-11-12", text: "x".repeat(5001) }));
    expect(await db.studentNote.count()).toBe(0);

    await db.studentNote.createMany({ data: Array.from({ length: 1000 }, () => ({ studentId: w.student.id, date: new Date("2026-11-12"), text: "n" })) });
    await actions.addNote(form({ date: "2026-11-12", text: "one too many" }));
    expect(await db.studentNote.count()).toBe(1000);
  });

  it("deletes only the student's own note", async () => {
    const w = await setup();
    const stranger = await account("student");
    const mine = await db.studentNote.create({ data: { studentId: w.student.id, date: new Date("2026-11-12"), text: "mine" } });
    const theirs = await db.studentNote.create({ data: { studentId: stranger.user.id, date: new Date("2026-11-12"), text: "theirs" } });
    await actions.deleteNote(form({ id: theirs.id }));
    expect(await db.studentNote.count()).toBe(2);
    await actions.deleteNote(form({ id: mine.id }));
    expect((await db.studentNote.findMany()).map((x) => x.id)).toEqual([theirs.id]);
  });

  it("adds a to-do with or without a day, and drops an invalid day", async () => {
    await setup();
    await actions.addTodo(form({ title: "  read chapter 3 ", dueAt: "2026-11-15" }));
    await actions.addTodo(form({ title: "no day" }));
    await actions.addTodo(form({ title: "bad day", dueAt: "2026-13-45" }));
    await actions.addTodo(form({ title: "   " }));
    const todos = await db.studentTodo.findMany({ orderBy: { createdAt: "asc" } });
    expect(todos.map((t) => [t.title, t.dueAt?.toISOString().slice(0, 10) ?? null])).toEqual([
      ["read chapter 3", "2026-11-15"],
      ["no day", null],
      ["bad day", null],
    ]);
  });

  it("stops adding to-dos at the limit", async () => {
    const w = await setup();
    await db.studentTodo.createMany({ data: Array.from({ length: 500 }, () => ({ studentId: w.student.id, title: "t" })) });
    await actions.addTodo(form({ title: "one too many" }));
    expect(await db.studentTodo.count()).toBe(500);
  });

  it("ticks, unticks and deletes only the student's own to-dos", async () => {
    const w = await setup();
    const stranger = await account("student");
    const mine = await db.studentTodo.create({ data: { studentId: w.student.id, title: "mine" } });
    const theirs = await db.studentTodo.create({ data: { studentId: stranger.user.id, title: "theirs" } });
    await actions.toggleTodo(form({ id: mine.id }));
    expect((await db.studentTodo.findUniqueOrThrow({ where: { id: mine.id } })).done).toBe(true);
    await actions.toggleTodo(form({ id: mine.id }));
    expect((await db.studentTodo.findUniqueOrThrow({ where: { id: mine.id } })).done).toBe(false);

    await actions.toggleTodo(form({ id: theirs.id }));
    await actions.deleteTodo(form({ id: theirs.id }));
    expect(await db.studentTodo.findUniqueOrThrow({ where: { id: theirs.id } })).toMatchObject({ done: false });
    await actions.deleteTodo(form({ id: mine.id }));
    expect(await db.studentTodo.count()).toBe(1);
  });
});

describe("notifications and devices", () => {
  it("saves a choice for every notification type, and changes it on the next save", async () => {
    const w = await setup();
    const some = NOTIFICATION_TYPES[0];
    const other = NOTIFICATION_TYPES[1];
    expect(await actions.updateNotificationPreferences(undefined, form({ [`email:${some}`]: "on", [`push:${other}`]: "on" }))).toEqual({ ok: "emailSaved" });
    const rows = await db.notificationPreference.findMany({ where: { userId: w.student.id } });
    expect(rows).toHaveLength(NOTIFICATION_TYPES.length);
    expect(rows.find((r) => r.type === some)).toMatchObject({ email: true, push: false });
    expect(rows.find((r) => r.type === other)).toMatchObject({ email: false, push: true });

    await actions.updateNotificationPreferences(undefined, form({ [`push:${some}`]: "on" }));
    expect(await db.notificationPreference.findUniqueOrThrow({ where: { userId_type: { userId: w.student.id, type: some } } })).toMatchObject({ email: false, push: true });
    expect(await db.notificationPreference.count()).toBe(NOTIFICATION_TYPES.length);
  });

  const sub = (endpoint: string) => ({ endpoint, keys: { p256dh: "pkey", auth: "akey" } });

  it("saves a push device only for a real push service over https", async () => {
    const w = await setup();
    expect(await actions.savePushSubscription(sub("https://fcm.googleapis.com/fcm/send/abc"))).toEqual({ ok: true });
    expect(await db.pushSubscription.findFirstOrThrow()).toMatchObject({ userId: w.student.id, p256dh: "pkey", auth: "akey" });

    for (const endpoint of ["http://fcm.googleapis.com/x", "https://evil.example/x", "https://internal.local:8080/x", "https://fcm.googleapis.com.evil.example/x"]) {
      expect(await actions.savePushSubscription(sub(endpoint))).toEqual({ ok: false });
    }
    expect(await actions.savePushSubscription({ endpoint: "https://fcm.googleapis.com/y" })).toEqual({ ok: false });
    expect(await actions.savePushSubscription("garbage")).toEqual({ ok: false });
    expect(await db.pushSubscription.count()).toBe(1);
  });

  it("gives a device to whoever registers it last (one browser, one student), without duplicating it", async () => {
    const w = await setup();
    const previous = await account("student");
    const endpoint = "https://fcm.googleapis.com/fcm/send/shared";
    await db.pushSubscription.create({ data: { userId: previous.user.id, endpoint, p256dh: "old", auth: "old" } });
    expect(await actions.savePushSubscription(sub(endpoint))).toEqual({ ok: true });
    expect(await db.pushSubscription.findMany()).toMatchObject([{ userId: w.student.id, p256dh: "pkey" }]);
  });

  it("removes only the student's own device", async () => {
    const w = await setup();
    const stranger = await account("student");
    await db.pushSubscription.createMany({
      data: [
        { userId: w.student.id, endpoint: "https://fcm.googleapis.com/mine", p256dh: "p", auth: "a" },
        { userId: stranger.user.id, endpoint: "https://fcm.googleapis.com/theirs", p256dh: "p", auth: "a" },
      ],
    });
    await actions.removePushSubscription("https://fcm.googleapis.com/theirs");
    expect(await db.pushSubscription.count()).toBe(2);
    await actions.removePushSubscription("https://fcm.googleapis.com/mine");
    expect((await db.pushSubscription.findFirstOrThrow()).userId).toBe(stranger.user.id);
  });

  it("marks only the student's own notifications as read", async () => {
    const w = await setup();
    const stranger = await account("student");
    await db.notification.createMany({
      data: [
        { userId: w.student.id, type: NOTIFICATION_TYPES[0], payload: {} },
        { userId: w.student.id, type: NOTIFICATION_TYPES[1], payload: {}, readAt: new Date("2026-01-01") },
        { userId: stranger.user.id, type: NOTIFICATION_TYPES[0], payload: {} },
      ],
    });
    await actions.markAllNotificationsRead();
    expect(await db.notification.count({ where: { userId: w.student.id, readAt: null } })).toBe(0);
    expect(await db.notification.count({ where: { userId: stranger.user.id, readAt: null } })).toBe(1);
    // An already-read one keeps its original time.
    expect((await db.notification.findFirstOrThrow({ where: { type: NOTIFICATION_TYPES[1] } })).readAt?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("profile and privacy", () => {
  it("saves a real timezone and refuses an invented one", async () => {
    const w = await setup();
    expect(await actions.updateTimezone(undefined, form({ timezone: "Europe/London" }))).toEqual({ ok: "timezoneSaved" });
    expect((await db.user.findUniqueOrThrow({ where: { id: w.student.id } })).timezone).toBe("Europe/London");
    expect(await actions.updateTimezone(undefined, form({ timezone: "UTC" }))).toEqual({ ok: "timezoneSaved" });
    expect(await actions.updateTimezone(undefined, form({ timezone: "Mars/Olympus" }))).toEqual({ error: "badTimezone" });
    expect(await actions.updateTimezone(undefined, form({ timezone: "" }))).toEqual({ error: "badTimezone" });
    expect((await db.user.findUniqueOrThrow({ where: { id: w.student.id } })).timezone).toBe("UTC");
  });

  it("changes the language for the account and the browser, and stays on the page", async () => {
    const w = await setup();
    expect(await redirectsTo(actions.updateLocale(form({ locale: "ru", path: "/homework" })))).toBe("/ru/homework");
    expect((await db.user.findUniqueOrThrow({ where: { id: w.student.id } })).locale).toBe("ru");
    expect([...state.cookies.values()]).toContain("ru");
  });

  it("stays inside this site, and ignores a language that does not exist", async () => {
    const w = await setup();
    for (const evil of ["https://evil.example", "//evil.example", "\\\\evil"]) {
      expect(await redirectsTo(actions.updateLocale(form({ locale: "az", path: evil })))).toBe("/az");
    }
    expect(await actions.updateLocale(form({ locale: "xx" }))).toBeUndefined();
    expect((await db.user.findUniqueOrThrow({ where: { id: w.student.id } })).locale).toBe("az");
  });

  it("records the privacy notice only when the age is confirmed", async () => {
    const w = await setup();
    await actions.acceptPrivacy(form({}));
    expect((await db.user.findUniqueOrThrow({ where: { id: w.student.id } })).privacyAcceptedAt).toBeNull();
    expect(await redirectsTo(actions.acceptPrivacy(form({ ageConfirm: "on" })))).toBe("/en");
    expect(await db.user.findUniqueOrThrow({ where: { id: w.student.id } })).toMatchObject({ privacyVersion: PRIVACY_VERSION });
  });

  it("records a deletion request and lets the student take it back", async () => {
    const w = await setup();
    await actions.requestDeletion();
    expect((await db.user.findUniqueOrThrow({ where: { id: w.student.id } })).deletionRequestedAt).toBeInstanceOf(Date);
    await actions.cancelDeletion();
    expect((await db.user.findUniqueOrThrow({ where: { id: w.student.id } })).deletionRequestedAt).toBeNull();
    // An admin's approval is a separate step: asking never erases anything by itself.
    expect((await db.user.findUniqueOrThrow({ where: { id: w.student.id } })).deletionApprovedAt).toBeNull();
  });
});

// Everything not meant for the public must refuse a request that is not a signed-in student, and write nothing.
const PUBLIC = new Set(["login", "logout", "requestPasswordReset", "resetPassword"]);

describe("authorization matrix", () => {
  it("every other action refuses a request that is not a signed-in student, and writes nothing", async () => {
    await setup();
    state.signedIn = false;
    const count = () =>
      Promise.all([db.user.count(), db.submission.count(), db.submissionFile.count(), db.studentNote.count(), db.studentTodo.count(), db.notification.count(), db.pushSubscription.count(), db.notificationPreference.count()]);
    const before = await count();

    const guarded = Object.entries(actions).filter(([name, fn]) => typeof fn === "function" && !PUBLIC.has(name));
    const source = readFileSync(fileURLToPath(new URL("../actions.ts", import.meta.url)), "utf8");
    const declared = [...source.matchAll(/^export async function (\w+)/gm)].map((m) => m[1]);
    expect(guarded.map(([name]) => name).sort()).toEqual(declared.filter((name) => !PUBLIC.has(name)).sort());

    const unguarded: string[] = [];
    for (const [name, fn] of guarded) {
      try {
        await (fn as (a: unknown, b: unknown) => Promise<unknown>)(form({}), form({}));
        unguarded.push(name);
      } catch (e) {
        if ((e as Error).message !== NOT_STUDENT) unguarded.push(`${name} (${(e as Error).message})`);
      }
    }
    expect(unguarded).toEqual([]);
    expect(await count()).toEqual(before);
  });
});
