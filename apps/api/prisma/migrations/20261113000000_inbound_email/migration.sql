-- Each organisation gets a random inbound address slug; existing rows are filled by the default.
ALTER TABLE "organisations" ADD COLUMN "inbound_slug" TEXT NOT NULL DEFAULT substr(md5(gen_random_uuid()::text), 1, 10);

-- CreateIndex
CREATE UNIQUE INDEX "organisations_inbound_slug_key" ON "organisations"("inbound_slug");
