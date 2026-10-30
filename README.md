# courses_student — Student Diary

The student's personal diary for the Online Courses System: today's lessons,
day-by-day diary, schedule, homework (view and submit), marks with weighted
averages, attendance, private notes and to-dos, notifications.

Next.js 16 (App Router, Cache Components) · TypeScript · Tailwind CSS 4 ·
Prisma 7 + PostgreSQL. Mobile-first, installable as a PWA.

## Setup

```bash
npm install
cp .env.example .env        # set DATABASE_URL and SESSION_SECRET
npm run db:migrate          # create tables
npm run db:seed             # demo data (wipes all tables!)
npm run dev
```

Demo login after seeding: `student@example.com` / `password123`.
Teacher and admin accounts are seeded too, and this app rejects them.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server on http://localhost:3000 |
| `npm run build` | Production build |
| `npm run typecheck` / `npm run lint` | Checks |
| `npm run db:migrate` | Apply / create Prisma migrations |
| `npm run db:seed` | Reset the database with demo data |

## Structure

```
prisma/schema.prisma      Shared data model (all three apps use the same tables)
prisma/seed.ts            Demo data, dev only
src/proxy.ts              Optimistic redirect to /login when there is no session cookie
src/lib/session.ts        Signed JWT session cookie (HS256, 7 days)
src/lib/auth.ts           getCurrentStudent(): verifies session + student role
src/lib/data.ts           All reads, always scoped to the signed-in student
src/lib/dates.ts          Day/week/month helpers in the student's timezone
src/app/actions.ts        Server actions: login, submit homework, notes, to-dos…
src/app/(diary)/          Screens: Today, Diary, Schedule, Homework, Marks,
                          Attendance, Notes, Notifications, Profile, More
```

## Notes

- **Shared schema.** `prisma/schema.prisma` is the data model from the plan.
  Until there is a shared package, keep it identical in the admin and teacher
  repos and let only one repo own migrations.
- **Sessions.** `SESSION_SECRET` must be the same in all three apps if they
  ever share a cookie domain. The cookie name is `cs_session`.
- **Not done yet:** file uploads for homework (Vercel Blob; links work for
  now), email/push notifications, offline caching for the PWA.

## Accounts and sign-in

- **Sessions:** a signed cookie (`cs_session`, HS256) that lasts 30 days from last
  use. `src/proxy.ts` renews it at most once a day. The cookie carries
  `User.sessionVersion`; increasing that number signs out every device.
- **Checked on every request** (`getCurrentStudent()` in `src/lib/auth.ts`): the
  role is student, the account is active, and the session version matches.
- **Login limits:** 5 failed attempts per email, or 20 per IP, block login for
  15 minutes (`login_attempts` table).
- **Passwords:** bcrypt, at least 8 characters. Changing or resetting the password
  signs out every other device.
- **First login:** an admin gives the student a temporary password, and the student
  must choose their own before using the app.
- **Forgot password:** an admin sends a one-time reset link, valid for 1 hour and
  usable once. Only its SHA-256 hash is stored. Self-service reset by email comes
  in Step 6.

Students can also reset their password themselves (see "Notifications and email").
Until the Admin Panel exists, admins run these scripts (`APP_URL` sets the link base):

```bash
npm run auth:temp-password -- student@example.com
npm run auth:reset-link -- student@example.com
```

In the seed, `murad@example.com` starts with a temporary password (`password123`),
so you can try the first-login flow.

## Homework files

Students attach photos, PDF, Word, Excel, PowerPoint or text files (up to 10 MB each,
5 per homework) until the submission is graded. The rules live in
`src/lib/upload-policy.ts`.

1. The browser asks `POST /api/uploads` for permission. The server checks the student,
   the homework, the term, the grade, the file type, the size and the file count.
2. The browser uploads the file directly to a **private** Vercel Blob store, using a
   token that only works for that one path, type and size. In development, without
   `BLOB_READ_WRITE_TOKEN`, it goes to `PUT /api/uploads/local` and is saved in
   `./.uploads`.
3. The `attachUpload` server action checks the stored file's real size and records
   a `SubmissionFile` row. Anything that fails the checks is deleted.
4. Files stay "not handed in yet" (`submissionId` is null) until the student presses
   Submit.

Files are only served through `GET /api/files/[id]`, which checks who is asking (only
the owner for now; teachers and admins come with their apps). The content type is
always derived from the file extension, never taken from the browser, and responses
are sent with `nosniff` and a sandboxing CSP.

**Production:** create a Blob store in Vercel (private access) and connect it to the
project, which sets `BLOB_READ_WRITE_TOKEN`.

## Attempts, late rule and drafts

- **Every Submit creates a `SubmissionAttempt`** with the answer, links, files and time.
  Earlier attempts are never changed, and their files are read-only. `Submission`
  holds the current state: the latest status, score and feedback.
- **Keeping files:** on a new attempt the student can keep the previous attempt's
  files. The `SubmissionFile` rows are copied and share the same stored file, which
  is deleted only when no row uses it any more.
- **Late rule:** an attempt is late if it's after the deadline, unless the previous
  attempt was returned for revision. Revisions are never late.
- **Receipt:** the latest attempt is shown as a receipt with a reference code (the
  last 8 characters of the attempt id, e.g. `PXPT-KREF`), so an admin can find it.
- **Drafts** are stored in the browser (`localStorage`, per student and homework).
  They're offered back only when newer than the last hand-in and different from it,
  and are cleared after a successful Submit.

**For the Teacher app:** when returning or grading, set `outcome`, `score`, `feedback`
and `reviewedAt` on the latest attempt, *and* update `Submission.status/score/feedback`
to match.

## Marks, final grades and attendance

The rules are in `src/lib/grading.ts`. The Teacher and Admin apps must use the same
functions, so everyone sees the same numbers.

- **Scale:** marks are stored on a 0–100 scale. A homework scored out of another
  maximum is converted when the mark is created (`toHundredScale`: 18/20 becomes 90).
- **Average** = Σ(value × weight) / Σ(weight), using each mark's own weight. It's
  shown with 1 decimal, in green (≥ 85), amber (60–84.9) or red (< 60).
- **Attendance %:** present and late count as attended; excused lessons aren't
  counted at all.
- **Attendance warnings:** below `SchoolSettings.attendanceWarnBelow` (80) the
  student sees a warning, and below `attendanceRiskBelow` (70) an "at risk" alert.
  The current term's alerts also appear on Today.
- **Terms:** Marks and Attendance show the current term (the one containing today,
  or else the latest one that has started). Past terms are in a switcher (`?term=`).
- **Final grades** appear only when published. For a finished term without one, the
  student sees "not published yet". There is no class average or rank.

`SchoolSettings` is a single row (id 1). The Admin Panel will edit it; `markWeights`
holds the default weight per mark type for the Teacher app.

## Notifications and email

- **One way to notify** (`src/lib/notifications/notify.ts`): `notify(userId, type, payload,
  { dedupeKey })` creates the in-app notification and, if the student wants that type
  by email, sends it in their language. The same `dedupeKey` is never delivered twice.
  The Teacher and Admin apps must call this, not insert rows themselves.
- **Payloads are data, not text**, as defined in `src/lib/notifications/types.ts`
  (for example `{ homeworkId, homeworkTitle, course, dueAt }`). `renderNotification()`
  turns them into text for the page and for email, in any language.
- **Email by default:** deadline reminders, returned homework and lesson changes.
  New homework and new marks are in-app only. Students change this per type in
  Profile, and in-app notifications are always on.
- **Deadline reminders:** `vercel.json` runs `/api/cron/reminders` daily at 14:00 UTC
  (18:00 Baku). It reminds everyone who hasn't handed in homework due in the next 24
  hours. Vercel's free Hobby plan allows only daily jobs (±59 min); reminders more
  often than daily need Pro. The route requires `Authorization: Bearer $CRON_SECRET`.
  To run it locally:

  ```bash
  curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/reminders
  ```

- **Email delivery:** through Resend when `RESEND_API_KEY` is set (`EMAIL_FROM` must
  use a domain verified in Resend). Without a key, in development, each email is
  saved as an HTML file in `./.emails`.
- **Forgot password:** `/[lang]/forgot-password` emails a 1-hour, one-time link. The
  answer is the same whether or not the account exists. It's limited to 3 links per
  account per hour, and requests count toward the login attempt limits.

## Languages

Every page lives under `/az`, `/en` or `/ru` (`src/app/[lang]/`).

- `src/proxy.ts` adds the prefix when it's missing. It uses the `cs_locale` cookie,
  then the browser's language, then Azerbaijani.
- `User.locale` stores the student's choice. The first login saves the language
  they're using at the time; after that, logging in opens the saved language on
  any device. Students change it in Profile.
- UI text is in `src/i18n/dictionaries/` (`en.ts` is the source; `az.ts` and `ru.ts`
  must have the same keys, and TypeScript enforces that). Use `fmt()` for
  `{placeholders}` and `plural()` for counts (Russian has one/few/many forms).
- Server Components get the text with `await getI18n()` (reads the URL via
  `next/root-params`). Client components receive their labels as props. Server
  actions return message keys, never text.
- Course names, topics and teacher feedback are data and are not translated.
- The Azerbaijani and Russian translations still need a check by a native speaker.

## Decisions (MVP)

- Grading scale: 0–100 points.
- Languages: Azerbaijani (default), English and Russian. See "Languages" below.
- Parent access: not in the MVP.
- Default timezone for new users: `Asia/Baku`. Students can change it in Profile.
- Final grades are shown only after the admin publishes them.
