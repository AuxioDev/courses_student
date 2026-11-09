-- One mark per student per homework. Lesson marks have a NULL homework_id, which Postgres
-- treats as distinct, so they are unaffected.
CREATE UNIQUE INDEX "marks_student_id_homework_id_key" ON "marks"("student_id", "homework_id");
