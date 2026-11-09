-- AlterTable
ALTER TABLE "users" ADD COLUMN     "nfc_uid" VARCHAR(20);

-- CreateIndex
CREATE UNIQUE INDEX "users_nfc_uid_key" ON "users"("nfc_uid");
