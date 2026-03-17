-- Detach profile addresses from City and store full address fields directly on UserAddress.
ALTER TABLE "UserAddress"
  ADD COLUMN "full_address" TEXT,
  ADD COLUMN "region" TEXT,
  ADD COLUMN "city" TEXT,
  ADD COLUMN "house" TEXT,
  ADD COLUMN "apartment" TEXT,
  ADD COLUMN "entrance" TEXT,
  ADD COLUMN "lat" DOUBLE PRECISION,
  ADD COLUMN "lon" DOUBLE PRECISION;

UPDATE "UserAddress" ua
SET
  "region" = parsed."region",
  "city" = parsed."city",
  "house" = parsed."house",
  "apartment" = parsed."apartment",
  "entrance" = parsed."entrance",
  "full_address" = parsed."full_address"
FROM (
  SELECT
    source."id",
    COALESCE(city."region", '') AS "region",
    COALESCE(city."name", '') AS "city",
    COALESCE(
      NULLIF(
        BTRIM(
          COALESCE(
            (
              REGEXP_MATCH(
                COALESCE(source."building", ''),
                '(?:^|,[[:space:]]*)(?:д(?:ом)?\.?)[[:space:]]*([^,]+)',
                'i'
              )
            )[1],
            ''
          )
        ),
        ''
      ),
      NULLIF(BTRIM(SPLIT_PART(COALESCE(source."building", ''), ',', 1)), ''),
      ''
    ) AS "house",
    COALESCE(
      NULLIF(
        BTRIM(
          COALESCE(
            (
              REGEXP_MATCH(
                COALESCE(source."building", ''),
                '(?:^|,[[:space:]]*)(?:кв(?:артира)?\.?)[[:space:]]*([^,]+)',
                'i'
              )
            )[1],
            ''
          )
        ),
        ''
      ),
      ''
    ) AS "apartment",
    COALESCE(
      NULLIF(
        BTRIM(
          COALESCE(
            (
              REGEXP_MATCH(
                COALESCE(source."building", ''),
                '(?:^|,[[:space:]]*)(?:под[ъь]?езд)[[:space:]]*([^,]+)',
                'i'
              )
            )[1],
            ''
          )
        ),
        ''
      ),
      ''
    ) AS "entrance",
    CONCAT_WS(
      ', ',
      NULLIF(COALESCE(city."region", ''), ''),
      NULLIF(COALESCE(city."name", ''), ''),
      NULLIF(COALESCE(source."street", ''), ''),
      NULLIF(
        CONCAT_WS(
          ', ',
          CASE
            WHEN COALESCE(
              NULLIF(
                BTRIM(
                  COALESCE(
                    (
                      REGEXP_MATCH(
                        COALESCE(source."building", ''),
                        '(?:^|,[[:space:]]*)(?:д(?:ом)?\.?)[[:space:]]*([^,]+)',
                        'i'
                      )
                    )[1],
                    ''
                  )
                ),
                ''
              ),
              NULLIF(BTRIM(SPLIT_PART(COALESCE(source."building", ''), ',', 1)), ''),
              ''
            ) <> ''
              THEN CONCAT(
                'д. ',
                COALESCE(
                  NULLIF(
                    BTRIM(
                      COALESCE(
                        (
                          REGEXP_MATCH(
                            COALESCE(source."building", ''),
                            '(?:^|,[[:space:]]*)(?:д(?:ом)?\.?)[[:space:]]*([^,]+)',
                            'i'
                          )
                        )[1],
                        ''
                      )
                    ),
                    ''
                  ),
                  NULLIF(BTRIM(SPLIT_PART(COALESCE(source."building", ''), ',', 1)), ''),
                  ''
                )
              )
            ELSE NULL
          END,
          CASE
            WHEN COALESCE(
              NULLIF(
                BTRIM(
                  COALESCE(
                    (
                      REGEXP_MATCH(
                        COALESCE(source."building", ''),
                        '(?:^|,[[:space:]]*)(?:под[ъь]?езд)[[:space:]]*([^,]+)',
                        'i'
                      )
                    )[1],
                    ''
                  )
                ),
                ''
              ),
              ''
            ) <> ''
              THEN CONCAT(
                'подъезд ',
                COALESCE(
                  NULLIF(
                    BTRIM(
                      COALESCE(
                        (
                          REGEXP_MATCH(
                            COALESCE(source."building", ''),
                            '(?:^|,[[:space:]]*)(?:под[ъь]?езд)[[:space:]]*([^,]+)',
                            'i'
                          )
                        )[1],
                        ''
                      )
                    ),
                    ''
                  ),
                  ''
                )
              )
            ELSE NULL
          END,
          CASE
            WHEN COALESCE(
              NULLIF(
                BTRIM(
                  COALESCE(
                    (
                      REGEXP_MATCH(
                        COALESCE(source."building", ''),
                        '(?:^|,[[:space:]]*)(?:кв(?:артира)?\.?)[[:space:]]*([^,]+)',
                        'i'
                      )
                    )[1],
                    ''
                  )
                ),
                ''
              ),
              ''
            ) <> ''
              THEN CONCAT(
                'кв. ',
                COALESCE(
                  NULLIF(
                    BTRIM(
                      COALESCE(
                        (
                          REGEXP_MATCH(
                            COALESCE(source."building", ''),
                            '(?:^|,[[:space:]]*)(?:кв(?:артира)?\.?)[[:space:]]*([^,]+)',
                            'i'
                          )
                        )[1],
                        ''
                      )
                    ),
                    ''
                  ),
                  ''
                )
              )
            ELSE NULL
          END
        ),
        ''
      )
    ) AS "full_address"
  FROM "UserAddress" source
  LEFT JOIN "City" city
    ON source."city_id" = city."id"
) parsed
WHERE ua."id" = parsed."id";

UPDATE "UserAddress"
SET
  "region" = COALESCE("region", ''),
  "city" = COALESCE("city", ''),
  "house" = COALESCE("house", ''),
  "apartment" = COALESCE("apartment", ''),
  "entrance" = COALESCE("entrance", ''),
  "full_address" = COALESCE(
    NULLIF("full_address", ''),
    CONCAT_WS(', ',
      NULLIF("region", ''),
      NULLIF("city", ''),
      NULLIF("street", ''),
      NULLIF("house", '')
    )
  );

ALTER TABLE "UserAddress"
  ALTER COLUMN "full_address" SET NOT NULL,
  ALTER COLUMN "full_address" SET DEFAULT '',
  ALTER COLUMN "region" SET NOT NULL,
  ALTER COLUMN "region" SET DEFAULT '',
  ALTER COLUMN "city" SET NOT NULL,
  ALTER COLUMN "city" SET DEFAULT '',
  ALTER COLUMN "house" SET NOT NULL,
  ALTER COLUMN "house" SET DEFAULT '',
  ALTER COLUMN "apartment" SET DEFAULT '',
  ALTER COLUMN "entrance" SET DEFAULT '';

ALTER TABLE "UserAddress" DROP COLUMN "building";
ALTER TABLE "UserAddress" DROP COLUMN "city_id";
