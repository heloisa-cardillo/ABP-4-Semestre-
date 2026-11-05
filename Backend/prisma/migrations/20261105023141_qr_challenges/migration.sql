-- CreateTable
CREATE TABLE "qr_challenges" (
    "id" UUID NOT NULL,
    "terminal_id" UUID NOT NULL,
    "secret_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qr_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "qr_challenges_terminal_id_expires_at_idx" ON "qr_challenges"("terminal_id", "expires_at");

-- AddForeignKey
ALTER TABLE "qr_challenges" ADD CONSTRAINT "qr_challenges_terminal_id_fkey" FOREIGN KEY ("terminal_id") REFERENCES "terminals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
