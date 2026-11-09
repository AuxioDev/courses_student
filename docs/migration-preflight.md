# Before deploying migration `20261109120000_mark_unique_homework`

The migration adds `UNIQUE (student_id, homework_id)` to `marks`. It **fails, and the Vercel build with
it, if the target database already has two marks for the same student and homework.** The Teacher App's
grading depends on it (one mark per homework; a re-grade moves the mark and writes `mark_history`).
Lesson marks have no homework, so they are unaffected.

## 1. Look for duplicates (read-only)
Run against the database you are about to migrate, in the Neon SQL editor or `psql`:

```sql
SELECT student_id, homework_id, COUNT(*) AS n,
       array_agg(id ORDER BY created_at) AS mark_ids
FROM marks
WHERE homework_id IS NOT NULL
GROUP BY student_id, homework_id
HAVING COUNT(*) > 1;
```

No rows: go ahead. Any rows: decide per pair which mark is the real one, keep it, delete the others,
and rerun the query until it is empty. Do not guess; ask the teacher.

## 2. Take a restore point
Create a Neon branch of the production database first (Neon console, Branches, Create branch). If
anything goes wrong, point `DATABASE_URL` at it, or restore from it.

## 3. Deploy the Student Diary, then check
`vercel-build` runs `prisma migrate deploy` only for production builds. Afterwards:

```sql
SELECT indexname FROM pg_indexes WHERE indexname = 'marks_student_id_homework_id_key';  -- 1 row
```

## Undo (only if you must)
```sql
DROP INDEX "marks_student_id_homework_id_key";
```
The Teacher App's `giveZero` and re-grading then lose their double-tap protection, so do not deploy
the Teacher App while the index is missing.
