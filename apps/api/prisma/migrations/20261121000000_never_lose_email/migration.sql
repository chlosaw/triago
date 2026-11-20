-- Why a ticket needs a person to triage it (AI drafting, AI failed, held back); null when drafted normally.
ALTER TABLE "tickets" ADD COLUMN "manual_triage" TEXT;

-- The email's Message-ID, unique per organisation, so the same email via two channels is one ticket.
ALTER TABLE "tickets" ADD COLUMN "message_id" TEXT;
CREATE UNIQUE INDEX "tickets_org_id_message_id_key" ON "tickets"("org_id", "message_id");
