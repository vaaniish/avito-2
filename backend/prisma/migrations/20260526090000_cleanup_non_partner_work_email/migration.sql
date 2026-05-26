UPDATE "AppUser" AS "u"
SET "work_email" = (
  SELECT "pop"."support_email"
  FROM "PartnershipRequest" AS "pr"
  JOIN "PartnerOnboardingProfile" AS "pop"
    ON "pop"."request_id" = "pr"."id"
  WHERE "pr"."user_id" = "u"."id"
    AND "pr"."status" IN ('APPROVED', 'APPROVED_LIMITED')
  ORDER BY "pr"."created_at" DESC, "pr"."id" DESC
  LIMIT 1
)
WHERE "u"."work_email" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "PartnershipRequest" AS "pr"
    WHERE "pr"."user_id" = "u"."id"
      AND "pr"."status" IN ('APPROVED', 'APPROVED_LIMITED')
  );

UPDATE "AppUser" AS "u"
SET "work_email" = NULL
WHERE "u"."work_email" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "PartnershipRequest" AS "pr"
    WHERE "pr"."user_id" = "u"."id"
      AND "pr"."status" IN ('APPROVED', 'APPROVED_LIMITED')
  );
