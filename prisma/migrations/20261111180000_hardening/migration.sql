-- Hardening: temporary-password expiry, an admin audit log, indexes on foreign keys the apps filter by,
-- and CHECK constraints that mirror the rules the apps already enforce. Additive: nothing is dropped.
-- Prisma does not model CHECK constraints, so they exist only here; they do not show up in `migrate diff`.

-- AlterTable
ALTER TABLE "users" ADD COLUMN "temp_password_expires_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "admin_audit_log" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target_id" TEXT,
    "detail" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_audit_log_created_at_idx" ON "admin_audit_log"("created_at");
CREATE INDEX "admin_audit_log_actor_id_created_at_idx" ON "admin_audit_log"("actor_id", "created_at");
CREATE INDEX "admin_audit_log_target_id_idx" ON "admin_audit_log"("target_id");
CREATE INDEX "enrollments_student_id_idx" ON "enrollments"("student_id");
CREATE INDEX "lessons_teacher_id_starts_at_idx" ON "lessons"("teacher_id", "starts_at");
CREATE INDEX "attendance_student_id_idx" ON "attendance"("student_id");
CREATE INDEX "groups_teacher_id_idx" ON "groups"("teacher_id");
CREATE INDEX "groups_term_id_idx" ON "groups"("term_id");
CREATE INDEX "groups_course_id_idx" ON "groups"("course_id");
CREATE INDEX "submissions_student_id_idx" ON "submissions"("student_id");
CREATE INDEX "marks_group_id_idx" ON "marks"("group_id");
CREATE INDEX "mark_history_mark_id_idx" ON "mark_history"("mark_id");
CREATE INDEX "final_grades_group_id_idx" ON "final_grades"("group_id");
CREATE INDEX "final_grades_term_id_idx" ON "final_grades"("term_id");
CREATE INDEX "student_todos_student_id_idx" ON "student_todos"("student_id");
CREATE INDEX "auth_tokens_user_id_idx" ON "auth_tokens"("user_id");
CREATE INDEX "applications_group_id_idx" ON "applications"("group_id");
CREATE INDEX "applications_student_id_idx" ON "applications"("student_id");

-- AddForeignKey
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CHECK constraints (same limits as the Teacher and Admin actions)
ALTER TABLE "marks" ADD CONSTRAINT "marks_value_range" CHECK ("value" >= 0 AND "value" <= 100);
ALTER TABLE "marks" ADD CONSTRAINT "marks_weight_positive" CHECK ("weight" > 0);
ALTER TABLE "mark_history" ADD CONSTRAINT "mark_history_value_range" CHECK ("old_value" >= 0 AND "old_value" <= 100 AND "new_value" >= 0 AND "new_value" <= 100);
ALTER TABLE "final_grades" ADD CONSTRAINT "final_grades_value_range" CHECK ("value" >= 0 AND "value" <= 100);
ALTER TABLE "homework" ADD CONSTRAINT "homework_max_score_positive" CHECK ("max_score" >= 1);
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_score_non_negative" CHECK ("score" IS NULL OR "score" >= 0);
ALTER TABLE "groups" ADD CONSTRAINT "groups_capacity_non_negative" CHECK ("capacity" IS NULL OR "capacity" >= 0);
ALTER TABLE "groups" ADD CONSTRAINT "groups_price_non_negative" CHECK ("monthly_price" IS NULL OR "monthly_price" >= 0);
ALTER TABLE "schedule_rules" ADD CONSTRAINT "schedule_rules_weekday_range" CHECK ("weekday" >= 0 AND "weekday" <= 6);
