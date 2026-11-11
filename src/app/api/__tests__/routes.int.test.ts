// The Student's HTTP routes against a real database: who may download a file, export data, or get an upload token.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  studentId: null as string | null,
  ip: "10.0.0.1",
  objects: new Map<string, string>(),
  written: [] as string[],
}));

vi.mock("@/lib/auth", () => ({
  getStudentOrNull: async () => (state.studentId ? { id: state.studentId, name: "S", email: "s@x", timezone: "Asia/Baku", locale: "en" } : null),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-real-ip": state.ip }), cookies: async () => ({}) }));
// @/i18n needs Next's request context (root params), which only exists inside a build: serve the real dictionaries.
vi.mock("@/i18n", async () => {
  const { en } = await import("@/i18n/dictionaries/en");
  const { fmt } = await import("@/i18n/format");
  return { getDictionary: () => en, getI18n: async () => ({ locale: "en", t: en }), getRequestLocale: async () => "en", fmt };
});
vi.mock("@/lib/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/storage")>();
  return {
    ...actual,
    readObject: vi.fn(async (key: string) => {
      const text = state.objects.get(key);
      return text === undefined ? null : new Blob([text]).stream();
    }),
    writeLocalObject: vi.fn(async (key: string) => void state.written.push(key)),
    listObjects: vi.fn(async () => []),
    deleteObject: vi.fn(async () => undefined),
  };
});

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { newStorageKey } from "@/lib/uploads";
import { createWorld, resetDatabase } from "../../../../test/db";
import { GET as downloadFile } from "../files/[id]/route";
import { GET as exportData } from "../privacy/export/route";
import { POST as requestUpload } from "../uploads/route";
import { PUT as putLocalUpload } from "../uploads/local/route";
import { GET as retentionCron } from "../cron/retention/route";
import { GET as remindersCron } from "../cron/reminders/route";

let n = 0;
async function setup() {
  const w = await createWorld();
  state.studentId = w.student.id;
  const stranger = await db.user.create({ data: { name: "Stranger", email: `stranger${++n}@t.local`, passwordHash: "x", role: "student" } });
  return { ...w, stranger };
}
const fileRow = (w: { homework: { id: string } }, studentId: string, extra: Record<string, unknown> = {}) =>
  db.submissionFile.create({
    data: { homeworkId: w.homework.id, studentId, name: "essay.pdf", size: 5, contentType: "application/pdf", storageKey: `submissions/${w.homework.id}/${studentId}/abc.pdf`, ...extra },
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;

beforeEach(async () => {
  await resetDatabase();
  state.studentId = null;
  state.ip = "10.0.0.1";
  state.objects.clear();
  state.written.length = 0;
});
afterAll(() => db.$disconnect());

describe("GET /api/files/[id]", () => {
  const get = (id: string, query = "") => downloadFile(new Request(`http://localhost/api/files/${id}${query}`), ctx(id));

  it("is refused without a signed-in student", async () => {
    const w = await setup();
    const f = await fileRow(w, w.student.id);
    state.studentId = null;
    expect((await get(f.id)).status).toBe(401);
  });

  it("hands a student their own file, shown in the browser when that is safe", async () => {
    const w = await setup();
    const f = await fileRow(w, w.student.id);
    state.objects.set(f.storageKey, "hello");
    const res = await get(f.id);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("hello");
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toBe("inline; filename*=UTF-8''essay.pdf");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("cache-control")).toBe("private, max-age=300");
  });

  it("downloads instead of showing a type a browser could run, or when asked to", async () => {
    const w = await setup();
    const doc = await fileRow(w, w.student.id, { name: "notes.docx", contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", storageKey: `submissions/${w.homework.id}/${w.student.id}/d.docx` });
    const pdf = await fileRow(w, w.student.id);
    state.objects.set(doc.storageKey, "x");
    state.objects.set(pdf.storageKey, "y");
    expect((await get(doc.id)).headers.get("content-disposition")).toMatch(/^attachment;/);
    expect((await get(pdf.id, "?download")).headers.get("content-disposition")).toMatch(/^attachment;/);
  });

  it("never serves another student's file, and says nothing that confirms it exists", async () => {
    const w = await setup();
    const theirs = await fileRow(w, w.stranger.id);
    state.objects.set(theirs.storageKey, "their secret");
    const res = await get(theirs.id);
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("");
    expect((await get("no-such-file")).status).toBe(404);
  });

  it("answers 404 when the stored copy is missing, and keeps a hostile file name out of the headers", async () => {
    const w = await setup();
    const f = await fileRow(w, w.student.id, { name: 'a"\r\nSet-Cookie: x=1.pdf' });
    expect((await get(f.id)).status).toBe(404);
    state.objects.set(f.storageKey, "z");
    const res = await get(f.id);
    expect(res.headers.get("content-disposition")).not.toMatch(/[\r\n"]/);
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});

describe("GET /api/privacy/export", () => {
  it("is refused without a signed-in student", async () => {
    await setup();
    state.studentId = null;
    expect((await exportData()).status).toBe(401);
  });

  it("contains the student's own data and nothing of anyone else's, nor anything secret", async () => {
    const w = await setup();
    const t = w.teacher.id;
    const forStudent = (id: string, tag: string) =>
      Promise.all([
        db.studentNote.create({ data: { studentId: id, date: new Date("2026-11-01"), text: `${tag} note` } }),
        db.studentTodo.create({ data: { studentId: id, title: `${tag} todo` } }),
        db.mark.create({ data: { studentId: id, groupId: w.group.id, type: "quiz", value: 77, comment: `${tag} comment`, createdBy: t } }),
        db.notification.create({ data: { userId: id, type: "new_mark", payload: { tag } } }),
        db.notificationPreference.create({ data: { userId: id, type: "new_mark", email: true } }),
        db.pushSubscription.create({ data: { userId: id, endpoint: `https://fcm.googleapis.com/${tag}`, p256dh: `${tag}-p256dh`, auth: `${tag}-auth` } }),
        db.authToken.create({ data: { userId: id, type: "reset", tokenHash: `${tag}-tokenhash`, expiresAt: new Date(Date.now() + 1000) } }),
        db.loginAttempt.create({ data: { email: `${tag}@t.local`, ip: `${tag}-ip`, success: false } }),
        db.finalGrade.create({ data: { studentId: id, groupId: w.group.id, termId: w.term.id, value: tag === "mine" ? 91 : 55, published: false } }),
      ]);
    await forStudent(w.student.id, "mine");
    await forStudent(w.stranger.id, "theirs");
    await db.enrollment.create({ data: { groupId: w.group.id, studentId: w.stranger.id } });
    await fileRow(w, w.student.id);
    await fileRow(w, w.stranger.id);

    const res = await exportData();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="student-diary-data.json"');
    expect(res.headers.get("cache-control")).toBe("no-store");
    const text = await res.text();
    const data = JSON.parse(text);

    expect(data.notes.map((x: { text: string }) => x.text)).toEqual(["mine note"]);
    expect(data.todos.map((x: { title: string }) => x.title)).toEqual(["mine todo"]);
    expect(data.marks.map((x: { comment: string }) => x.comment)).toEqual(["mine comment"]);
    expect(data.files).toHaveLength(1);
    // Nothing of the other student's, and nothing that is a secret or a mechanism rather than the student's data.
    for (const leak of ["theirs", "mine-p256dh", "mine-auth", "tokenhash", "mine-ip", "passwordHash", "password_hash", "sessionVersion", w.stranger.email]) {
      expect(text, leak).not.toContain(leak);
    }
    // A final grade the school has not published is not the student's to export yet.
    expect(data.finalGrades).toEqual([]);
    expect(data.profile).toMatchObject({ email: w.student.email, name: "Student" });
    expect(Object.keys(data).sort()).toEqual(["attendance", "enrollments", "exportedAt", "files", "finalGrades", "marks", "notes", "notificationPreferences", "notifications", "profile", "submissions", "todos"]);
  });

  it("includes a final grade once it is published", async () => {
    const w = await setup();
    await db.finalGrade.create({ data: { studentId: w.student.id, groupId: w.group.id, termId: w.term.id, value: 88, published: true } });
    const data = JSON.parse(await (await exportData()).text());
    expect(data.finalGrades).toMatchObject([{ value: 88 }]);
  });
});

describe("POST /api/uploads", () => {
  const post = (body: unknown) =>
    requestUpload(new NextRequest("http://localhost/api/uploads", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers: { "content-type": "application/json" } }));

  it("is refused without a signed-in student", async () => {
    const w = await setup();
    state.studentId = null;
    expect((await post({ homeworkId: w.homework.id, name: "a.pdf", size: 10 })).status).toBe(401);
  });

  it("hands out a key that only this student and homework can use", async () => {
    const w = await setup();
    const res = await post({ homeworkId: w.homework.id, name: "essay.pdf", size: 1234 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ driver: "local", contentType: "application/pdf" });
    expect(body.key.startsWith(`submissions/${w.homework.id}/${w.student.id}/`)).toBe(true);
    expect(body.key.endsWith(".pdf")).toBe(true);
    expect(body.uploadUrl).toContain(encodeURIComponent(body.key));
  });

  it("refuses bad input, other people's homework, unsupported types, oversize files and a full homework", async () => {
    const w = await setup();
    expect((await post("not json")).status).toBe(400);
    expect((await post({ homeworkId: w.homework.id, name: "a.pdf", size: -1 })).status).toBe(400);
    expect((await post({ name: "a.pdf", size: 10 })).status).toBe(400);

    state.studentId = w.stranger.id; // not in the group
    expect(await (await post({ homeworkId: w.homework.id, name: "a.pdf", size: 10 })).json()).toEqual({ error: "homeworkNotFound" });
    state.studentId = w.student.id;
    expect(await (await post({ homeworkId: w.homework.id, name: "virus.exe", size: 10 })).json()).toEqual({ error: "fileType" });
    expect(await (await post({ homeworkId: w.homework.id, name: "huge.pdf", size: 50 * 1024 * 1024 })).json()).toEqual({ error: "fileTooBig" });
    for (let i = 0; i < 5; i++) await fileRow(w, w.student.id, { storageKey: `submissions/${w.homework.id}/${w.student.id}/k${i}.pdf` });
    expect(await (await post({ homeworkId: w.homework.id, name: "sixth.pdf", size: 10 })).json()).toEqual({ error: "tooManyFiles" });
  });

  it("limits how many upload keys one student can ask for, across addresses", async () => {
    const w = await setup();
    const ask = () => post({ homeworkId: w.homework.id, name: "a.pdf", size: 10 });
    for (let i = 0; i < 30; i++) expect((await ask()).status).toBe(200);
    expect((await ask()).status).toBe(429);
    state.ip = "10.0.0.99";
    expect((await ask()).status).toBe(429); // the limit is per student, not per address
    state.studentId = w.stranger.id; // another student is not affected
    expect((await post({ homeworkId: w.homework.id, name: "a.pdf", size: 10 })).status).toBe(400); // refused for another reason, not 429
  });
});

describe("PUT /api/uploads/local", () => {
  const put = (key: string, body: string | null = "data", headers: Record<string, string> = {}) =>
    putLocalUpload(
      new NextRequest(`http://localhost/api/uploads/local?key=${encodeURIComponent(key)}`, {
        method: "PUT",
        body: body ?? undefined,
        headers: { "content-length": String(body?.length ?? 0), ...headers },
      }),
    );

  it("is refused without a signed-in student", async () => {
    const w = await setup();
    state.studentId = null;
    expect((await put(newStorageKey(w.student.id, w.homework.id, "a.pdf"))).status).toBe(401);
  });

  it("stores a file under a key issued to this student for this homework", async () => {
    const w = await setup();
    const key = newStorageKey(w.student.id, w.homework.id, "a.pdf");
    expect((await put(key)).status).toBe(200);
    expect(state.written).toEqual([key]);
  });

  it("refuses somebody else's key, a key that is not one of ours, and a type that is not allowed, and writes nothing", async () => {
    const w = await setup();
    for (const key of [newStorageKey(w.stranger.id, w.homework.id, "a.pdf"), "../../etc/passwd", "submissions/x/y/z", newStorageKey(w.student.id, w.homework.id, "a.exe")]) {
      expect((await put(key)).status).toBe(400);
    }
    expect(state.written).toEqual([]);
  });

  it("refuses an empty or oversized body, and once the work is graded", async () => {
    const w = await setup();
    const key = newStorageKey(w.student.id, w.homework.id, "a.pdf");
    expect((await put(key, "", { "content-length": "0" })).status).toBe(413);
    expect((await put(key, "x", { "content-length": String(20 * 1024 * 1024) })).status).toBe(413);
    await db.submission.create({ data: { homeworkId: w.homework.id, studentId: w.student.id, status: "graded", score: 1 } });
    expect((await put(key)).status).toBe(400);
    expect(state.written).toEqual([]);
  });
});

describe("the cron routes", () => {
  const call = (handler: (r: NextRequest) => Promise<Response>, authorization?: string) =>
    handler(new NextRequest("http://localhost/api/cron/x", { headers: authorization ? { authorization } : {} }));

  beforeEach(() => vi.stubEnv("CRON_SECRET", "the-cron-secret"));
  afterAll(() => vi.unstubAllEnvs());

  it("refuse a request without the secret, with a wrong one, or when none is configured", async () => {
    for (const handler of [retentionCron, remindersCron]) {
      expect((await call(handler)).status).toBe(401);
      expect((await call(handler, "Bearer nope")).status).toBe(401);
      expect((await call(handler, "the-cron-secret")).status).toBe(401);
    }
    vi.stubEnv("CRON_SECRET", "");
    expect((await call(retentionCron, "Bearer ")).status).toBe(401);
    expect((await call(remindersCron, "Bearer undefined")).status).toBe(401);
  });

  it("run with the right secret and report what they did", async () => {
    await setup();
    const retention = await call(retentionCron, "Bearer the-cron-secret");
    expect(retention.status).toBe(200);
    expect(await retention.json()).toMatchObject({ erased: 0, failed: 0, applications: 0, uploads: { orphaned: 0, deleted: 0, failed: 0 } });
    const reminders = await call(remindersCron, "Bearer the-cron-secret");
    expect(reminders.status).toBe(200);
    expect(await reminders.json()).toMatchObject({ homework: 0, sent: 0, skipped: 0, failed: 0 });
  });
});
