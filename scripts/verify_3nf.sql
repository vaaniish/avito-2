-- Post-migration validation checks for 3NF rollout.

-- 1) Listings without normalized item
SELECT count(*) AS listings_without_item
FROM marketplace_listing
WHERE item_id IS NULL;

-- 2) Listings without any image
SELECT count(*) AS listings_without_images
FROM marketplace_listing l
WHERE NOT EXISTS (
  SELECT 1 FROM listing_image li WHERE li.listing_id = l.id
);

-- 3) Seller users without seller profile
SELECT count(*) AS sellers_without_profile
FROM app_user u
WHERE u.role = 'SELLER'
  AND NOT EXISTS (
    SELECT 1 FROM seller_profile sp WHERE sp.user_id = u.id
  );

-- 4) Broken item references by type mismatch
SELECT count(*) AS type_mismatch_listings
FROM marketplace_listing l
JOIN catalog_item i ON i.id = l.item_id
JOIN catalog_subcategory s ON s.id = i.subcategory_id
JOIN catalog_category c ON c.id = s.category_id
WHERE c.type <> l.type;

-- 5) Duplicate attribute keys per listing (potential bad legacy import)
SELECT listing_id, key, count(*) AS duplicates
FROM listing_attribute
GROUP BY listing_id, key
HAVING count(*) > 1
ORDER BY duplicates DESC, listing_id;
