-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('BUILDING', 'GATEHOUSE', 'DOOR', 'TURNSTILE');

-- CreateEnum
CREATE TYPE "AuthorizationStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AccessMethod" AS ENUM ('QR', 'NFC');

-- CreateEnum
CREATE TYPE "AccessResult" AS ENUM ('GRANTED', 'DENIED');

-- CreateEnum
CREATE TYPE "DenyReason" AS ENUM ('INVALID_CREDENTIAL', 'EXPIRED_CREDENTIAL', 'CREDENTIAL_ALREADY_USED', 'UNKNOWN_USER', 'USER_INACTIVE', 'TERMINAL_INACTIVE', 'NO_AUTHORIZATION', 'AUTHORIZATION_CANCELLED', 'OUTSIDE_DATE_RANGE', 'OUTSIDE_TIME_WINDOW', 'USAGE_LIMIT_REACHED', 'OUT_OF_RANGE');

-- CreateTable
CREATE TABLE "locations" (
    "id" UUID NOT NULL,
    "type" "LocationType" NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500),
    "address" VARCHAR(255),
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "parent_id" UUID,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terminals" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "location_id" UUID NOT NULL,
    "secret_hash" CHAR(64) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "last_seen_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "terminals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "authorizations" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "start_time" TIME(0) NOT NULL,
    "end_time" TIME(0) NOT NULL,
    "max_uses" INTEGER,
    "uses_count" INTEGER NOT NULL DEFAULT 0,
    "status" "AuthorizationStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_by_id" UUID NOT NULL,
    "cancelled_at" TIMESTAMPTZ(3),
    "cancelled_by_id" UUID,
    "cancel_reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "authorizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_events" (
    "id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" "AccessMethod" NOT NULL,
    "result" "AccessResult" NOT NULL,
    "deny_reason" "DenyReason",
    "user_id" UUID,
    "terminal_id" UUID,
    "location_id" UUID,
    "authorization_id" UUID,
    "credential" VARCHAR(128),
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "distance_meters" DOUBLE PRECISION,

    CONSTRAINT "access_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "locations_parent_id_idx" ON "locations"("parent_id");

-- CreateIndex
CREATE INDEX "locations_type_idx" ON "locations"("type");

-- CreateIndex
CREATE UNIQUE INDEX "terminals_location_id_key" ON "terminals"("location_id");

-- CreateIndex
CREATE INDEX "authorizations_user_id_status_idx" ON "authorizations"("user_id", "status");

-- CreateIndex
CREATE INDEX "authorizations_location_id_idx" ON "authorizations"("location_id");

-- CreateIndex
CREATE INDEX "access_events_occurred_at_idx" ON "access_events"("occurred_at" DESC);

-- CreateIndex
CREATE INDEX "access_events_user_id_occurred_at_idx" ON "access_events"("user_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "access_events_location_id_occurred_at_idx" ON "access_events"("location_id", "occurred_at" DESC);

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terminals" ADD CONSTRAINT "terminals_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authorizations" ADD CONSTRAINT "authorizations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authorizations" ADD CONSTRAINT "authorizations_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authorizations" ADD CONSTRAINT "authorizations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authorizations" ADD CONSTRAINT "authorizations_cancelled_by_id_fkey" FOREIGN KEY ("cancelled_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_events" ADD CONSTRAINT "access_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_events" ADD CONSTRAINT "access_events_terminal_id_fkey" FOREIGN KEY ("terminal_id") REFERENCES "terminals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_events" ADD CONSTRAINT "access_events_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_events" ADD CONSTRAINT "access_events_authorization_id_fkey" FOREIGN KEY ("authorization_id") REFERENCES "authorizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Nomes ordenados como em português (ICU), não por byte: "de Serviço" vem antes de "Principal".
ALTER TABLE "users" ALTER COLUMN "name" TYPE VARCHAR(120) COLLATE "und-x-icu";
ALTER TABLE "locations" ALTER COLUMN "name" TYPE VARCHAR(120) COLLATE "und-x-icu";
ALTER TABLE "terminals" ALTER COLUMN "name" TYPE VARCHAR(120) COLLATE "und-x-icu";

-- Integridade que o schema do Prisma não expressa. O banco recusa o dado errado
-- mesmo que ele chegue por fora da API.

ALTER TABLE "locations"
  ADD CONSTRAINT "locations_latitude_range" CHECK ("latitude" BETWEEN -90 AND 90),
  ADD CONSTRAINT "locations_longitude_range" CHECK ("longitude" BETWEEN -180 AND 180),
  ADD CONSTRAINT "locations_coordinates_pair" CHECK (("latitude" IS NULL) = ("longitude" IS NULL)),
  ADD CONSTRAINT "locations_root_is_building" CHECK (("type" = 'BUILDING') = ("parent_id" IS NULL));

ALTER TABLE "authorizations"
  ADD CONSTRAINT "authorizations_date_range" CHECK ("end_date" >= "start_date"),
  ADD CONSTRAINT "authorizations_time_window" CHECK ("end_time" > "start_time"),
  ADD CONSTRAINT "authorizations_max_uses_positive" CHECK ("max_uses" IS NULL OR "max_uses" > 0),
  ADD CONSTRAINT "authorizations_uses_within_limit" CHECK ("uses_count" >= 0 AND ("max_uses" IS NULL OR "uses_count" <= "max_uses")),
  ADD CONSTRAINT "authorizations_cancellation_consistent" CHECK (("status" = 'CANCELLED') = ("cancelled_at" IS NOT NULL));

ALTER TABLE "access_events"
  ADD CONSTRAINT "access_events_deny_reason_consistent" CHECK (("result" = 'DENIED') = ("deny_reason" IS NOT NULL)),
  ADD CONSTRAINT "access_events_distance_non_negative" CHECK ("distance_meters" IS NULL OR "distance_meters" >= 0);

-- Histórico de acessos é trilha de auditoria: depois de gravado, não muda nem some.
CREATE FUNCTION "access_events_reject_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'access_events é imutável: % não é permitido', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "access_events_immutable"
  BEFORE UPDATE OR DELETE ON "access_events"
  FOR EACH ROW EXECUTE FUNCTION "access_events_reject_mutation"();
