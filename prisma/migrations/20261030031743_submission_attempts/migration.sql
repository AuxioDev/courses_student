-- Every hand-in becomes an attempt. Existing submissions are copied into attempt 1
-- and their handed-in files move to that attempt, so nothing is lost.

CREATE TYPE "AttemptOutcome" AS ENUM ('returned', 'graded');

CREATE TABLE "submission_attempts" (
    "id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "content" TEXT,
    "links" TEXT[],
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "late" BOOLEAN NOT NULL DEFAULT false,
    "outcome" "AttemptOutcome",
    "score" INTEGER,
    "feedback" TEXT,
    "reviewed_at" TIMESTAMP(3),

    CONSTRAINT "submission_attempts_pkey" PRIMARY KEY ("id")
);

-- Backfill: one attempt per existing submission.
INSERT INTO "submission_attempts" ("id", "submission_id", "number", "content", "links", "submitted_at", "late", "outcome", "score", "feedback")
SELECT
    'att_' || s."id",
    s."id",
    1,
    s."content",
    s."links",
    s."submitted_at",
    s."status" = 'late',
    CASE s."status" WHEN 'graded' THEN 'graded'::"AttemptOutcome" WHEN 'returned' THEN 'returned'::"AttemptOutcome" END,
    s."score",
    s."feedback"
FROM "submissions" s;

ALTER TABLE "submission_files" ADD COLUMN "attempt_id" TEXT;
UPDATE "submission_files" SET "attempt_id" = 'att_' || "submission_id" WHERE "submission_id" IS NOT NULL;

ALTER TABLE "submission_files" DROP CONSTRAINT "submission_files_submission_id_fkey";
ALTER TABLE "submission_files" DROP COLUMN "submission_id";

-- A kept file is listed again in the next attempt, so storage keys repeat.
DROP INDEX "submission_files_storage_key_key";
CREATE INDEX "submission_files_storage_key_idx" ON "submission_files"("storage_key");

CREATE UNIQUE INDEX "submission_attempts_submission_id_number_key" ON "submission_attempts"("submission_id", "number");

ALTER TABLE "submission_files" ADD CONSTRAINT "submission_files_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "submission_attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "submission_attempts" ADD CONSTRAINT "submission_attempts_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
