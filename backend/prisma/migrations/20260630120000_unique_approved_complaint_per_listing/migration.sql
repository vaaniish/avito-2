-- Keep complaint decisions consistent with the product rule:
-- one approved complaint closes the listing, and every other open complaint
-- on that listing is only an archive resolution.

UPDATE "MarketplaceListing" listing
SET
  status = 'INACTIVE',
  moderation_status = 'REJECTED'
WHERE EXISTS (
  SELECT 1
  FROM "Complaint" complaint
  WHERE complaint.listing_id = listing.id
    AND complaint.status = 'APPROVED'
);

WITH approved_rank AS (
  SELECT
    id,
    listing_id,
    ROW_NUMBER() OVER (
      PARTITION BY listing_id
      ORDER BY COALESCE(checked_at, created_at), created_at, id
    ) AS approved_order
  FROM "Complaint"
  WHERE status = 'APPROVED'
),
duplicate_approved AS (
  UPDATE "Complaint" complaint
  SET
    status = 'REJECTED',
    checked_at = COALESCE(complaint.checked_at, NOW()),
    action_taken = 'Объявление снято с продажи после рассмотрения связанной жалобы'
  FROM approved_rank ranked
  WHERE complaint.id = ranked.id
    AND ranked.approved_order > 1
  RETURNING complaint.id
)
UPDATE "ComplaintSanction" sanction
SET status = 'COMPLETED'
WHERE sanction.complaint_id IN (SELECT id FROM duplicate_approved);

WITH canonical_approved AS (
  SELECT DISTINCT ON (listing_id)
    id,
    listing_id,
    public_id
  FROM "Complaint"
  WHERE status = 'APPROVED'
  ORDER BY listing_id, COALESCE(checked_at, created_at), created_at, id
)
UPDATE "Complaint" complaint
SET
  status = 'REJECTED',
  checked_at = COALESCE(complaint.checked_at, NOW()),
  action_taken = 'Объявление снято с продажи после рассмотрения связанной жалобы'
FROM canonical_approved approved
WHERE complaint.listing_id = approved.listing_id
  AND complaint.id <> approved.id
  AND complaint.status IN ('NEW', 'PENDING');

CREATE UNIQUE INDEX IF NOT EXISTS "Complaint_one_approved_per_listing_idx"
  ON "Complaint" ("listing_id")
  WHERE status = 'APPROVED';
