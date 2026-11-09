# Testing the Student Diary

| Command | What it runs | Needs |
|---|---|---|
| `npm test` | 91 unit tests (Vitest): pure logic, security helpers, translations, colour contrast | nothing |
| `npm run test:integration` | 16 integration tests against a real Postgres, calling the real server actions | `TEST_DATABASE_URL` |
| `npm run test:watch` | unit tests, re-run on save | nothing |

## Integration tests use a throwaway database
They `TRUNCATE` every table. The three apps share one real database, so the helper in
`test/db.ts` **refuses to run unless the database name ends in `_test`** (verified: it refuses `courses_student`).

```bash
createdb courses_test
# Only the Student Diary has migrations; Teacher and Admin can use `npx prisma db push` instead:
URL=postgresql://localhost:5432/courses_test
# Set both: the migration config prefers DATABASE_URL_UNPOOLED if your .env defines it.
DATABASE_URL=$URL DATABASE_URL_UNPOOLED=$URL npx prisma migrate deploy
TEST_DATABASE_URL=postgresql://localhost:5432/courses_test npm run test:integration
```

CI does the same on a Postgres service container (`.github/workflows/ci.yml`).

## What is covered
- **Sessions and passwords:** signing, expiry, tampering, `alg: none`, wrong secret, weak secret, bcrypt, token hashing.
- **Login rate limit** (real database): 5 failures per email, 100 per IP, 15-minute window, resets separate from logins.
- **Dates:** Asia/Baku days, DST, week and month arithmetic.
- **Marks and grading:** weighted average, bands, attendance rate and levels, the unique mark per homework.
- **Translations:** az, en and ru have identical keys, no empty strings, identical `{placeholders}`.
- **Colour contrast:** every text, button and focus colour meets WCAG AA in light and dark (reads the real CSS).
- **Student-specific:** upload rules (extension, size, file signature sniffing, no SVG/HTML/executables), cron secret check.
- **Known limit:** the upload round trip (browser → storage → record → hand-in) is covered by the cross-app suite in `../e2e`, not here.
