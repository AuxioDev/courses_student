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

Until the Admin Panel exists, admins run these scripts (`APP_URL` sets the link base):

```bash
npm run auth:temp-password -- student@example.com
npm run auth:reset-link -- student@example.com
```

In the seed, `murad@example.com` starts with a temporary password (`password123`),
so you can try the first-login flow.

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
