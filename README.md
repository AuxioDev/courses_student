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
- **Grading scale** is assumed to be 0–100 (open question in the plan).
