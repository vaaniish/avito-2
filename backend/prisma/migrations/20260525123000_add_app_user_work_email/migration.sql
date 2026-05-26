ALTER TABLE "AppUser"
ADD COLUMN "work_email" TEXT;

UPDATE "AppUser" AS "u"
SET "work_email" = COALESCE(
  (
    SELECT "pop"."support_email"
    FROM "PartnershipRequest" AS "pr"
    JOIN "PartnerOnboardingProfile" AS "pop"
      ON "pop"."request_id" = "pr"."id"
    WHERE "pr"."user_id" = "u"."id"
      AND "pr"."status" IN ('APPROVED', 'APPROVED_LIMITED')
    ORDER BY "pr"."created_at" DESC, "pr"."id" DESC
    LIMIT 1
  ),
  "u"."email"
)
WHERE "u"."work_email" IS NULL;
