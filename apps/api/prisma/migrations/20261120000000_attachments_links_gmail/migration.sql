-- Related links on a ticket.
ALTER TABLE "tickets" ADD COLUMN "links" JSONB NOT NULL DEFAULT '[]';

-- Files attached to tickets.
CREATE TABLE "attachments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "uploader_id" UUID,
    "filename" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "attachments_ticket_id_created_at_idx" ON "attachments"("ticket_id", "created_at");
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_org_id_ticket_id_fkey" FOREIGN KEY ("org_id", "ticket_id") REFERENCES "tickets"("org_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- One connected Gmail mailbox per organisation.
CREATE TABLE "gmail_connections" (
    "org_id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "connected_by_id" UUID,
    "last_synced_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gmail_connections_pkey" PRIMARY KEY ("org_id")
);
ALTER TABLE "gmail_connections" ADD CONSTRAINT "gmail_connections_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "gmail_connections" ADD CONSTRAINT "gmail_connections_connected_by_id_fkey" FOREIGN KEY ("connected_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
