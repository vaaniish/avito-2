-- Legacy -> 3NF migration helper (PostgreSQL)
-- Run this script ONLY on the legacy schema (before applying the new Prisma schema).
-- It creates normalized entities and backfills data from denormalized columns.

BEGIN;

-- 1) New normalized tables
CREATE TABLE IF NOT EXISTS seller_profile (
  id serial PRIMARY KEY,
  user_id integer NOT NULL UNIQUE REFERENCES app_user(id) ON DELETE CASCADE,
  is_verified boolean NOT NULL DEFAULT false,
  average_response_minutes integer,
  commission_tier_id integer REFERENCES commission_tier(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS catalog_item (
  id serial PRIMARY KEY,
  subcategory_id integer NOT NULL REFERENCES catalog_subcategory(id) ON DELETE CASCADE,
  public_id text NOT NULL UNIQUE,
  name text NOT NULL,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subcategory_id, name)
);

CREATE TABLE IF NOT EXISTS listing_image (
  id serial PRIMARY KEY,
  listing_id integer NOT NULL REFERENCES marketplace_listing(id) ON DELETE CASCADE,
  url text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (listing_id, sort_order)
);

CREATE TABLE IF NOT EXISTS listing_attribute (
  id serial PRIMARY KEY,
  listing_id integer NOT NULL REFERENCES marketplace_listing(id) ON DELETE CASCADE,
  key text NOT NULL,
  value text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);

ALTER TABLE marketplace_listing
  ADD COLUMN IF NOT EXISTS item_id integer REFERENCES catalog_item(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_marketplace_listing_item_id ON marketplace_listing(item_id);
CREATE INDEX IF NOT EXISTS idx_seller_profile_commission_tier_id ON seller_profile(commission_tier_id);
CREATE INDEX IF NOT EXISTS idx_listing_attribute_listing_id ON listing_attribute(listing_id);

-- 2) Fallback category tree for records that do not have a clean category mapping
INSERT INTO catalog_category (public_id, type, name, icon_key, order_index, created_at, updated_at)
SELECT 'legacy-products-fallback', 'PRODUCT', 'Legacy Products', 'box', 9999, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM catalog_category WHERE public_id = 'legacy-products-fallback');

INSERT INTO catalog_category (public_id, type, name, icon_key, order_index, created_at, updated_at)
SELECT 'legacy-services-fallback', 'SERVICE', 'Legacy Services', 'wrench', 9999, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM catalog_category WHERE public_id = 'legacy-services-fallback');

INSERT INTO catalog_subcategory (category_id, public_id, name, order_index, created_at, updated_at)
SELECT c.id, 'legacy-products-fallback-sub', 'Migrated', 9999, now(), now()
FROM catalog_category c
WHERE c.public_id = 'legacy-products-fallback'
  AND NOT EXISTS (SELECT 1 FROM catalog_subcategory WHERE public_id = 'legacy-products-fallback-sub');

INSERT INTO catalog_subcategory (category_id, public_id, name, order_index, created_at, updated_at)
SELECT c.id, 'legacy-services-fallback-sub', 'Migrated', 9999, now(), now()
FROM catalog_category c
WHERE c.public_id = 'legacy-services-fallback'
  AND NOT EXISTS (SELECT 1 FROM catalog_subcategory WHERE public_id = 'legacy-services-fallback-sub');

-- 3) Ensure each legacy category has a synthetic "Migrated" subcategory
INSERT INTO catalog_subcategory (category_id, public_id, name, order_index, created_at, updated_at)
SELECT c.id, 'legacy-sub-' || c.id::text, 'Migrated', 9999, now(), now()
FROM catalog_category c
WHERE c.public_id NOT IN ('legacy-products-fallback', 'legacy-services-fallback')
  AND NOT EXISTS (
    SELECT 1 FROM catalog_subcategory s
    WHERE s.category_id = c.id AND s.name = 'Migrated'
  );

-- 4) Migrate seller profile (from user + listing denormalized flags)
INSERT INTO seller_profile (user_id, is_verified, average_response_minutes, created_at, updated_at)
SELECT
  u.id,
  COALESCE(bool_or(l.is_verified), false),
  NULL,
  now(),
  now()
FROM app_user u
LEFT JOIN marketplace_listing l ON l.seller_id = u.id
WHERE u.role = 'SELLER'
GROUP BY u.id
ON CONFLICT (user_id) DO UPDATE
SET is_verified = excluded.is_verified,
    updated_at = now();

-- 5) Migrate legacy category_name -> catalog_item + item_id link
WITH listing_source AS (
  SELECT
    l.id AS listing_id,
    l.type,
    COALESCE(NULLIF(trim(l.category_name), ''), 'Uncategorized') AS item_name,
    l.category_id
  FROM marketplace_listing l
),
resolved_subcategory AS (
  SELECT
    ls.listing_id,
    ls.item_name,
    CASE
      WHEN ls.category_id IS NOT NULL THEN (
        SELECT s.id
        FROM catalog_subcategory s
        WHERE s.category_id = ls.category_id
          AND s.name = 'Migrated'
        ORDER BY s.id
        LIMIT 1
      )
      WHEN ls.type = 'SERVICE' THEN (
        SELECT s.id FROM catalog_subcategory s
        WHERE s.public_id = 'legacy-services-fallback-sub'
      )
      ELSE (
        SELECT s.id FROM catalog_subcategory s
        WHERE s.public_id = 'legacy-products-fallback-sub'
      )
    END AS subcategory_id
  FROM listing_source ls
),
upsert_items AS (
  INSERT INTO catalog_item (subcategory_id, public_id, name, order_index, created_at, updated_at)
  SELECT DISTINCT
    rs.subcategory_id,
    'legacy-item-' || md5(rs.subcategory_id::text || ':' || rs.item_name),
    rs.item_name,
    9999,
    now(),
    now()
  FROM resolved_subcategory rs
  WHERE rs.subcategory_id IS NOT NULL
  ON CONFLICT (subcategory_id, name) DO NOTHING
  RETURNING id, subcategory_id, name
)
UPDATE marketplace_listing l
SET item_id = ci.id
FROM resolved_subcategory rs
JOIN catalog_item ci
  ON ci.subcategory_id = rs.subcategory_id
 AND ci.name = rs.item_name
WHERE l.id = rs.listing_id
  AND l.item_id IS NULL;

-- 6) Migrate legacy image + images JSON string -> listing_image
INSERT INTO listing_image (listing_id, url, sort_order, created_at)
SELECT l.id, l.image, 0, now()
FROM marketplace_listing l
WHERE l.image IS NOT NULL
  AND trim(l.image) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM listing_image li
    WHERE li.listing_id = l.id AND li.sort_order = 0
  );

DO $$
DECLARE
  r record;
  arr jsonb;
  i integer;
BEGIN
  FOR r IN
    SELECT id, images
    FROM marketplace_listing
    WHERE images IS NOT NULL
      AND trim(images) <> ''
  LOOP
    BEGIN
      arr := r.images::jsonb;
      IF jsonb_typeof(arr) = 'array' THEN
        i := 0;
        FOR i IN 0 .. jsonb_array_length(arr) - 1 LOOP
          INSERT INTO listing_image (listing_id, url, sort_order, created_at)
          VALUES (r.id, arr ->> i, i + 1, now())
          ON CONFLICT (listing_id, sort_order) DO NOTHING;
        END LOOP;
      END IF;
    EXCEPTION
      WHEN others THEN
        -- Keep migration robust for malformed JSON in legacy column.
        CONTINUE;
    END;
  END LOOP;
END $$;

-- 7) Migrate legacy specifications JSON -> listing_attribute
DO $$
DECLARE
  r record;
  obj jsonb;
  kv record;
  idx integer;
BEGIN
  FOR r IN
    SELECT id, specifications
    FROM marketplace_listing
    WHERE specifications IS NOT NULL
      AND trim(specifications) <> ''
  LOOP
    BEGIN
      obj := r.specifications::jsonb;
      IF jsonb_typeof(obj) = 'object' THEN
        idx := 0;
        FOR kv IN SELECT key, value FROM jsonb_each_text(obj) LOOP
          INSERT INTO listing_attribute (listing_id, key, value, sort_order)
          VALUES (r.id, kv.key, kv.value, idx)
          ON CONFLICT DO NOTHING;
          idx := idx + 1;
        END LOOP;
      END IF;
    EXCEPTION
      WHEN others THEN
        CONTINUE;
    END;
  END LOOP;
END $$;

-- 8) Optional cleanup after app is switched to new schema.
-- Keep commented for first rollout. Uncomment only after verification.
-- ALTER TABLE marketplace_listing DROP COLUMN category_id;
-- ALTER TABLE marketplace_listing DROP COLUMN category_name;
-- ALTER TABLE marketplace_listing DROP COLUMN image;
-- ALTER TABLE marketplace_listing DROP COLUMN images;
-- ALTER TABLE marketplace_listing DROP COLUMN is_new;
-- ALTER TABLE marketplace_listing DROP COLUMN is_sale;
-- ALTER TABLE marketplace_listing DROP COLUMN is_verified;
-- ALTER TABLE marketplace_listing DROP COLUMN publish_date;
-- ALTER TABLE marketplace_listing DROP COLUMN seller_response_time;
-- ALTER TABLE marketplace_listing DROP COLUMN seller_listings;
-- ALTER TABLE marketplace_listing DROP COLUMN breadcrumbs;
-- ALTER TABLE marketplace_listing DROP COLUMN specifications;
-- ALTER TABLE marketplace_listing DROP COLUMN is_price_lower;
-- ALTER TABLE complaint DROP COLUMN seller_violations_count;
-- ALTER TABLE commission_tier DROP COLUMN sellers_count;

COMMIT;
