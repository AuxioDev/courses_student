-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('new', 'contacted', 'approved', 'rejected');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "bio" TEXT,
ADD COLUMN     "show_on_website" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "courses" ADD COLUMN     "level" TEXT,
ADD COLUMN     "show_on_website" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "groups" ADD COLUMN     "capacity" INTEGER,
ADD COLUMN     "monthly_price" INTEGER,
ADD COLUMN     "enrollment_open" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "applications" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "is_minor" BOOLEAN NOT NULL DEFAULT false,
    "guardian_name" TEXT,
    "guardian_phone" TEXT,
    "note" TEXT,
    "locale" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'new',
    "ip_hash" TEXT NOT NULL,
    "privacy_accepted_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "handled_at" TIMESTAMP(3),
    "handled_by" TEXT,
    "student_id" TEXT,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "applications_status_created_at_idx" ON "applications"("status", "created_at");

-- CreateIndex
CREATE INDEX "applications_email_group_id_idx" ON "applications"("email", "group_id");

-- CreateIndex
CREATE INDEX "applications_ip_hash_created_at_idx" ON "applications"("ip_hash", "created_at");

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_handled_by_fkey" FOREIGN KEY ("handled_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
