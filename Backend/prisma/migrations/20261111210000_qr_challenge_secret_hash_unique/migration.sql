-- O código do QR passou a ser o próprio segredo (25 caracteres): o desafio é achado pelo hash.
-- Os desafios existentes valem 10 segundos e estão no formato antigo; podem ser descartados.
DELETE FROM "qr_challenges";

-- CreateIndex
CREATE UNIQUE INDEX "qr_challenges_secret_hash_key" ON "qr_challenges"("secret_hash");
