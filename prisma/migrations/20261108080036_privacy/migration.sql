-- AlterTable
ALTER TABLE "users" ADD COLUMN     "deactivated_at" TIMESTAMP(3),
ADD COLUMN     "deletion_approved_at" TIMESTAMP(3),
ADD COLUMN     "deletion_requested_at" TIMESTAMP(3),
ADD COLUMN     "privacy_accepted_at" TIMESTAMP(3),
ADD COLUMN     "privacy_version" INTEGER,
ADD COLUMN     "private_data_erased_at" TIMESTAMP(3);

