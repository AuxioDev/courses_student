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
- **Flow:** `src/proxy.ts` sends logged-out visitors to `/login?next=<page>` and signed-in
  ones away from the login page. If a signed cookie is no longer valid, the page sends
  them to `/login?expired=1`, and the proxy deletes the cookie. The cookie is `Secure`
  on Vercel or when `APP_URL` is https, so a local http build can still log in.
- **Checked on every request** (`getCurrentStudent()` in `src/lib/auth.ts`): the
  role is student, the account is active, and the session version matches.
- **Login limits:** 5 failed attempts per email, or 100 per IP (a class shares one address), block login for
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

To create real student accounts from a CSV (`name,email,group`), check it first, then
apply. Temporary passwords go to `.imports/`, which git ignores; delete the file once
they're handed out.

```bash
npm run students:import -- students.csv
npm run students:import -- students.csv --apply
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

A file's first bytes must match its extension, so a renamed program is refused. This is
not virus scanning.

Files are only served through `GET /api/files/[id]`, which checks who is asking (only
the owner here; the Teacher app has its own route for the teacher of that group). The content type is
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

## Installable app, offline and push (PWA)

- **Install:** `src/app/manifest.ts` plus PNG icons in `public/icons` (regular, maskable,
  Apple). Today shows a small "Install" suggestion from the 2nd visit (at the bottom,
  so it never shifts the page), and Profile has an "App" card. On iPhone it explains
  Share → Add to Home Screen.
- **Service worker** (`public/sw.js`, production builds only):
  - Today, Diary, Schedule and the Homework list are saved per language and shown
    read-only when there's no network, with an "offline" banner. Other pages show
    `public/offline.html`.
  - Built JS/CSS files are cached. API calls and homework files never are.
  - The login page deletes the saved pages and this device's push subscription,
    so nothing stays behind for the next person on a shared phone.
- **Push:** students turn it on per device in Profile, and choose per type (Email /
  Phone). `notify()` sends to every device the student enabled. A device the push
  service reports as gone (404/410) is removed, and "Log out on all devices" removes
  them all. iPhones need iOS 16.4+ and the app installed to the home screen.
  Keys: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT`
  (generate with `npx web-push generate-vapid-keys`).
- **Speed:** measured with Lighthouse 13 on the mobile preset (slow 4G, 4× slower
  CPU) against `npm run build && npm start`: every page scores 100 for performance,
  accessibility and best practices, with LCP 0.8–0.9 s and no layout shift. The diary
  pages set `export const instant = false`, so they wait for their data on the server
  (tens of milliseconds) instead of showing a skeleton. React holds streamed sections
  back for up to ~300 ms after a skeleton appears, which had pushed LCP to ~2.6 s.

## Security and privacy

- **Headers** (`next.config.ts`): CSP, HSTS, no framing, `nosniff`, a strict referrer
  policy and a locked-down `Permissions-Policy`. The CSP has no nonces because they are
  incompatible with Partial Prerendering. Config headers replace ones set in a route,
  so route-specific rules (`/api/files`, `/sw.js`) must come after the site-wide rule.
- **Push:** only the real push services are accepted as endpoints
  (`isAllowedPushEndpoint`), so the server can't be pointed at other addresses.
- **Seed:** `npm run db:seed` refuses any non-local database unless `--yes-wipe` is passed.
- **Privacy notice:** `/[lang]/privacy`, accepted after the first login. Bump
  `PRIVACY_VERSION` in `src/lib/privacy.ts` when it changes materially, and everyone
  accepts it again. Set `PRIVACY_CONTACT_EMAIL` for the contact shown there.
- **Your data (Profile):** "Download my data" returns one JSON file with links to the
  uploaded files. Passwords, tokens, login attempts, push keys and unpublished final
  grades are left out.
- **Deletion:** students request it in Profile, and an admin handles it:

  ```bash
  npm run privacy:requests
  npm run privacy:approve-deletion -- student@example.com
  ```

- **Retention:** `/api/cron/retention` runs daily. It erases notes, to-dos, uploaded
  files, notifications and device data one year after deactivation, or at the next
  run after an approved deletion. Marks, attendance, final grades and submissions
  stay as school records. The Admin Panel must set `deactivatedAt` when deactivating
  (the job fills it in if it's missing).

## Deploying

Follow [docs/deploy-guide.md](docs/deploy-guide.md). `vercel.json` runs the app in
Frankfurt and schedules the daily jobs. Production builds apply migrations
(`npm run vercel-build`, using `DATABASE_URL_UNPOOLED`); preview builds never do.

## Design

Colours are tokens in `src/app/globals.css`: white pages, blue-gray structure, green for
actions, with amber and red only for warnings and overdue work. The login picture is
`public/login-photo.jpg`; replace that file to change it. Server errors reach the
deployment logs through `src/instrumentation.ts`, without request data.

## Checks

- **CI** (`.github/workflows/ci.yml`) runs on every push and pull request: clean
  install, all migrations on an empty database, the seed, typecheck, lint, build and a
  dependency audit. It needs no real secrets. There are no automated tests.
- **Before each release,** go through
  [docs/manual-test-checklist.md](docs/manual-test-checklist.md) on Chrome and on
  iPhone Safari.

## Languages

Every page lives under `/az`, `/en` or `/ru` (`src/app/[lang]/`).

- `src/proxy.ts` adds the prefix when it's missing. It uses the `cs_locale` cookie,
  then the browser's language, then Azerbaijani.
- `User.locale` stores the student's choice. The first login saves the language
  they're using at the time; after that, logging in opens the saved language on
  any device. Students change it in the top-right AZ / RU / EN menu.
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
