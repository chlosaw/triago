-- Who created a manual ticket, shown as its reporter.
ALTER TABLE "tickets" ADD COLUMN "created_by_id" UUID;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing manual tickets: the creator is the actor of their `created` event.
UPDATE "tickets" t
   SET "created_by_id" = e."actor_id"
  FROM "ticket_events" e
 WHERE e."ticket_id" = t."id" AND e."type" = 'created' AND t."source" = 'manual';
