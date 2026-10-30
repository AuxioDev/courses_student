// Development seed: demo courses, groups, lessons, homework and marks.
// Until the Admin Panel and Teacher App exist, this is the only way to get data in.
// Run with: npm run db:seed   (wipes all tables first)
import "dotenv/config";
import { rm } from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { addDays, dayKey, startOfDay, weekday } from "../src/lib/dates";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const TZ = "Asia/Baku"; // also the schema default for new users
const PASSWORD = "password123";

async function wipe() {
  // Files uploaded in local development (see src/lib/storage.ts).
  await rm(path.join(process.cwd(), ".uploads"), { recursive: true, force: true });
  await rm(path.join(process.cwd(), ".emails"), { recursive: true, force: true });
  await db.$transaction([
    db.submissionFile.deleteMany(),
    db.submissionAttempt.deleteMany(),
    db.loginAttempt.deleteMany(),
    db.authToken.deleteMany(),
    db.notificationPreference.deleteMany(),
    db.notification.deleteMany(),
    db.studentTodo.deleteMany(),
    db.studentNote.deleteMany(),
    db.finalGrade.deleteMany(),
    db.markHistory.deleteMany(),
    db.mark.deleteMany(),
    db.submission.deleteMany(),
    db.homework.deleteMany(),
    db.attendance.deleteMany(),
    db.lesson.deleteMany(),
    db.scheduleRule.deleteMany(),
    db.enrollment.deleteMany(),
    db.group.deleteMany(),
    db.term.deleteMany(),
    db.course.deleteMany(),
    db.user.deleteMany(),
    db.schoolSettings.deleteMany(),
  ]);
}

function at(key: string, time: string) {
  const [h, m] = time.split(":").map(Number);
  return new Date(startOfDay(key, TZ).getTime() + (h * 60 + m) * 60_000);
}

async function main() {
  await wipe();
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const now = new Date();
  const today = dayKey(now, TZ);

  const user = (name: string, email: string, role: "admin" | "teacher" | "student") =>
    db.user.create({ data: { name, email, role, passwordHash, timezone: TZ } });

  await user("Admin User", "admin@example.com", "admin");
  const leyla = await user("Leyla Mammadova", "leyla@example.com", "teacher");
  const tural = await user("Tural Aliyev", "tural@example.com", "teacher");
  const students = await Promise.all([
    user("Aysel Huseynova", "student@example.com", "student"),
    // Murad tests the first-login flow: he must choose his own password.
    user("Murad Karimov", "murad@example.com", "student").then((u) =>
      db.user.update({ where: { id: u.id }, data: { mustChangePassword: true } }),
    ),
    user("Nigar Rzayeva", "nigar@example.com", "student"),
  ]);
  const me = students[0];

  const term = await db.term.create({
    data: {
      name: "Autumn 2026",
      startDate: new Date(`${addDays(today, -35)}T00:00:00Z`),
      endDate: new Date(`${addDays(today, 56)}T00:00:00Z`),
    },
  });
  const english = await db.course.create({ data: { title: "English B2", description: "Upper-intermediate English" } });
  const python = await db.course.create({ data: { title: "Python Basics", description: "Programming from zero" } });

  const groups = [
    {
      group: await db.group.create({
        data: { name: "ENG-B2-1", courseId: english.id, teacherId: leyla.id, termId: term.id },
      }),
      teacher: leyla,
      rules: [
        { weekday: 1, startTime: "18:00", endTime: "19:30" },
        { weekday: 3, startTime: "18:00", endTime: "19:30" },
      ],
      topics: ["Present perfect", "Phrasal verbs", "Essay structure", "Listening practice", "Conditionals", "Debate"],
      url: "https://meet.example.com/eng-b2-1",
    },
    {
      group: await db.group.create({
        data: { name: "PY-1", courseId: python.id, teacherId: tural.id, termId: term.id },
      }),
      teacher: tural,
      rules: [
        { weekday: 2, startTime: "19:00", endTime: "20:30" },
        { weekday: 4, startTime: "19:00", endTime: "20:30" },
        { weekday: 6, startTime: "11:00", endTime: "12:30" },
      ],
      topics: ["Variables", "Conditions", "Loops", "Functions", "Lists", "Dictionaries", "Files"],
      url: "https://meet.example.com/py-1",
    },
  ];

  for (const { group, teacher, rules, topics, url } of groups) {
    await db.enrollment.createMany({ data: students.map((s) => ({ groupId: group.id, studentId: s.id })) });
    await db.scheduleRule.createMany({ data: rules.map((r) => ({ ...r, groupId: group.id })) });

    // Generate lessons from the schedule rules, 5 weeks back and 4 weeks ahead.
    let topicIndex = 0;
    for (let offset = -35; offset <= 28; offset++) {
      const key = addDays(today, offset);
      const rule = rules.find((r) => r.weekday === weekday(key));
      // Always give the student a lesson today so the Today screen has something to show.
      const forceToday = offset === 0 && group.name === "PY-1" && !rule;
      if (!rule && !forceToday) continue;
      const startsAt = rule ? at(key, rule.startTime) : new Date(now.getTime() + 5 * 60_000);
      const endsAt = rule ? at(key, rule.endTime) : new Date(startsAt.getTime() + 90 * 60_000);
      const past = endsAt < now;
      const status = offset === 9 ? "cancelled" : offset === 2 && group.name === "ENG-B2-1" ? "moved" : past ? "done" : "scheduled";
      const lesson = await db.lesson.create({
        data: {
          groupId: group.id,
          teacherId: teacher.id,
          startsAt,
          endsAt,
          status,
          meetingUrl: url,
          topic: topics[topicIndex++ % topics.length],
          materials: past ? "Slides and recording are in the group folder." : null,
        },
      });

      if (past && status === "done") {
        await db.attendance.createMany({
          data: students.map((s, i) => {
            const roll = (((offset * 7 + i * 13) % 10) + 10) % 10;
            // Aysel misses a few more Python lessons, so the attendance warning shows.
            const extraAbsence = i === 0 && group.name === "PY-1" && roll === 1;
            const status =
              roll === 3 ? "late" : roll === 7 || extraAbsence ? "absent" : roll === 9 ? "excused" : "present";
            return { lessonId: lesson.id, studentId: s.id, status };
          }),
        });
        if (offset % 3 === 0) {
          await db.mark.create({
            data: {
              studentId: me.id,
              groupId: group.id,
              lessonId: lesson.id,
              type: offset % 6 === 0 ? "quiz" : "classwork",
              value: 70 + Math.abs(offset * 7) % 30,
              weight: offset % 6 === 0 ? 2 : 1,
              createdBy: teacher.id,
              createdAt: endsAt,
            },
          });
        }
      }

      // Homework after every second lesson.
      if (topicIndex % 2 === 0) {
        const hw = await db.homework.create({
          data: {
            lessonId: lesson.id,
            groupId: group.id,
            title: `${lesson.topic}: practice`,
            description: `Complete the exercises on “${lesson.topic}”.\n\n1. Read the notes from the lesson.\n2. Do exercises 1–5.\n3. Write a short reflection (3–4 sentences).`,
            attachments: ["https://example.com/worksheet.pdf"],
            dueAt: new Date(endsAt.getTime() + 2 * 24 * 60 * 60_000),
            maxScore: 100,
            createdAt: endsAt,
          },
        });
        const dueAgo = (now.getTime() - hw.dueAt.getTime()) / 864e5;
        if (dueAgo > 7) {
          const score = 60 + Math.abs(offset * 11) % 40;
          const feedback = score > 85 ? "Excellent work!" : "Good effort — check exercise 3 again.";
          const submittedAt = new Date(hw.dueAt.getTime() - 3 * 60 * 60_000);
          const gradedAt = new Date(hw.dueAt.getTime() + 24 * 60 * 60_000);
          // Every third graded homework went through a revision first, to show attempt history.
          const revised = offset % 3 === 0;
          const firstAt = new Date(submittedAt.getTime() - 2 * 24 * 60 * 60_000);
          await db.submission.create({
            data: {
              homeworkId: hw.id,
              studentId: me.id,
              content: "My answers are in the linked document.",
              links: ["https://docs.example.com/my-answers"],
              submittedAt,
              status: "graded",
              score,
              feedback,
              attempts: {
                create: [
                  ...(revised
                    ? [
                        {
                          number: 1,
                          content: "Exercises 1–5 done.",
                          links: [],
                          submittedAt: firstAt,
                          outcome: "returned" as const,
                          feedback: "The reflection is missing — please add it.",
                          reviewedAt: new Date(firstAt.getTime() + 12 * 60 * 60_000),
                        },
                      ]
                    : []),
                  {
                    number: revised ? 2 : 1,
                    content: "My answers are in the linked document.",
                    links: ["https://docs.example.com/my-answers"],
                    submittedAt,
                    outcome: "graded" as const,
                    score,
                    feedback,
                    reviewedAt: gradedAt,
                  },
                ],
              },
            },
          });
          await db.mark.create({
            data: {
              studentId: me.id,
              groupId: group.id,
              homeworkId: hw.id,
              type: "homework",
              value: score,
              createdBy: teacher.id,
              createdAt: gradedAt,
            },
          });
        } else if (dueAgo > 3 && group.name === "ENG-B2-1") {
          const submittedAt = new Date(hw.dueAt.getTime() - 60 * 60_000);
          const feedback = "Please add the reflection paragraph and resubmit.";
          await db.submission.create({
            data: {
              homeworkId: hw.id,
              studentId: me.id,
              content: "First draft attached.",
              links: [],
              submittedAt,
              status: "returned",
              feedback,
              attempts: {
                create: {
                  number: 1,
                  content: "First draft attached.",
                  links: [],
                  submittedAt,
                  outcome: "returned",
                  feedback,
                  reviewedAt: new Date(submittedAt.getTime() + 24 * 60 * 60_000),
                },
              },
            },
          });
        } else if (dueAgo > 0 && dueAgo <= 3 && group.name === "PY-1") {
          const submittedAt = new Date(hw.dueAt.getTime() - 2 * 60 * 60_000);
          await db.submission.create({
            data: {
              homeworkId: hw.id,
              studentId: me.id,
              content: "print('done')",
              links: [],
              status: "submitted",
              submittedAt,
              attempts: { create: { number: 1, content: "print('done')", links: [], submittedAt } },
            },
          });
        }
      }
    }
  }

  await db.schoolSettings.create({ data: { id: 1 } });
  await seedPastTerm(students, leyla);

  await db.studentTodo.createMany({
    data: [
      { studentId: me.id, title: "Buy a new notebook", dueAt: new Date(`${addDays(today, 2)}T00:00:00Z`) },
      { studentId: me.id, title: "Revise for the Python quiz", dueAt: new Date(`${addDays(today, 5)}T00:00:00Z`) },
      { studentId: me.id, title: "Watch the English lesson recording", done: true },
    ],
  });
  await db.studentNote.create({
    data: { studentId: me.id, date: new Date(`${today}T00:00:00Z`), text: "Ask Tural about list comprehensions." },
  });

  // Payloads follow src/lib/notifications/types.ts, so they render in every language.
  const upcomingHw = await db.homework.findFirst({
    where: { dueAt: { gt: now } },
    orderBy: { dueAt: "asc" },
    include: { group: { select: { course: { select: { title: true } } } } },
  });
  const movedLesson = await db.lesson.findFirst({ where: { status: "moved" }, include: { group: { select: { course: { select: { title: true } } } } } });
  await db.notification.createMany({
    data: [
      ...(upcomingHw
        ? [
            {
              userId: me.id,
              type: "new_homework" as const,
              payload: {
                homeworkId: upcomingHw.id,
                homeworkTitle: upcomingHw.title,
                course: upcomingHw.group.course.title,
                dueAt: upcomingHw.dueAt.toISOString(),
              },
            },
          ]
        : []),
      ...(movedLesson
        ? [
            {
              userId: me.id,
              type: "lesson_changed" as const,
              payload: {
                course: movedLesson.group.course.title,
                change: "moved",
                date: dayKey(movedLesson.startsAt, TZ),
                newStartsAt: new Date(movedLesson.startsAt.getTime() + 24 * 60 * 60_000).toISOString(),
              },
            },
          ]
        : []),
      {
        userId: me.id,
        type: "new_mark",
        payload: { course: "Python Basics", markType: "quiz", value: 88 },
        readAt: now,
      },
    ],
  });

  console.log(`Seeded. Log in as student@example.com / ${PASSWORD}`);
}

// A finished term with its own course, low attendance and a published final grade,
// so the term switcher, the "at risk" alert and final grades can be tried out.
async function seedPastTerm(students: { id: string }[], teacher: { id: string }) {
  const [me] = students;
  const term = await db.term.create({
    data: { name: "Spring 2026", startDate: new Date("2026-02-02"), endDate: new Date("2026-06-12"), locked: true },
  });
  const course = await db.course.create({ data: { title: "English A2", description: "Elementary English" } });
  const group = await db.group.create({ data: { name: "ENG-A2-3", courseId: course.id, teacherId: teacher.id, termId: term.id } });
  await db.enrollment.createMany({ data: students.map((s) => ({ groupId: group.id, studentId: s.id })) });

  const topics = ["Present simple", "Past simple", "Food", "Travel", "Shopping", "Health", "Weather", "Hobbies"];
  for (let week = 0; week < 16; week++) {
    const startsAt = new Date(Date.UTC(2026, 1, 2 + week * 7, 13, 0)); // Mondays 17:00 in Baku
    const lesson = await db.lesson.create({
      data: {
        groupId: group.id,
        teacherId: teacher.id,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 90 * 60_000),
        status: "done",
        topic: topics[week % topics.length],
      },
    });
    await db.attendance.createMany({
      data: students.map((s, i) => ({
        lessonId: lesson.id,
        studentId: s.id,
        // Aysel missed 5 of 16 lessons: 69%, under the 70% limit.
        status: i === 0 && week % 3 === 1 && week < 15 ? "absent" : "present",
      })),
    });
    if (week % 3 === 0) {
      await db.mark.create({
        data: {
          studentId: me.id,
          groupId: group.id,
          lessonId: lesson.id,
          type: week === 15 ? "exam" : "quiz",
          value: 68 + ((week * 5) % 25),
          weight: week === 15 ? 3 : 2,
          createdBy: teacher.id,
          createdAt: lesson.endsAt,
        },
      });
    }
  }
  await db.finalGrade.create({ data: { studentId: me.id, groupId: group.id, termId: term.id, value: 78, published: true } });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
