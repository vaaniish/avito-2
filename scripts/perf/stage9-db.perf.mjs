import "dotenv/config";
import pg from "pg";

const { Client } = pg;

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://user:password@localhost:5433/avito-db-dev?schema=public";
const BENCHMARK_COMPLAINT_COUNT = Number(process.env.PERF_STAGE9_COMPLAINT_COUNT ?? "6000");
const BENCHMARK_LISTING_COUNT = Number(process.env.PERF_STAGE9_LISTING_COUNT ?? "12000");
const BENCHMARK_COMPLAINT_TYPE = "perf_stage9_benchmark";
const BENCHMARK_LISTING_TITLE_PREFIX = "perf_stage9_listing_benchmark";

function invariant(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function parseExplainJson(row) {
  const raw = row?.["QUERY PLAN"];
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error("unexpected EXPLAIN payload");
  }
  return raw[0];
}

function collectPlanNodes(planNode, acc = []) {
  if (!planNode || typeof planNode !== "object") {
    return acc;
  }
  acc.push({
    nodeType: planNode["Node Type"] ?? null,
    indexName: planNode["Index Name"] ?? null,
    relationName: planNode["Relation Name"] ?? null,
  });
  const subplans = Array.isArray(planNode.Plans) ? planNode.Plans : [];
  for (const nested of subplans) {
    collectPlanNodes(nested, acc);
  }
  return acc;
}

function summarizeExplain(planJson) {
  const rootPlan = planJson.Plan ?? {};
  return {
    planningTimeMs: Number(planJson["Planning Time"] ?? 0),
    executionTimeMs: Number(planJson["Execution Time"] ?? 0),
    totalCost: Number(rootPlan["Total Cost"] ?? 0),
    planRows: Number(rootPlan["Plan Rows"] ?? 0),
    nodes: collectPlanNodes(rootPlan),
  };
}

async function runExplain(client, sql, params = []) {
  const explain = await client.query(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`,
    params,
  );
  const payload = parseExplainJson(explain.rows[0]);
  return summarizeExplain(payload);
}

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  const benchmarkKey = Date.now();

  try {
    const listingRes = await client.query(
      `select id, seller_id
         from "MarketplaceListing"
        where status = 'ACTIVE'
        order by created_at desc
        limit 20`,
    );
    const listings = listingRes.rows;
    invariant(listings.length > 0, "listing seed data is required");
    const listingIds = listings.map((row) => Number(row.id));
    const listingSellerIds = listings.map((row) => Number(row.seller_id));
    const targetListingId = listingIds[0];
    const targetSellerId = listingSellerIds[0];

    const reporterRes = await client.query(
      `select id
         from "AppUser"
        where role = 'BUYER'
        order by id asc
        limit 1`,
    );
    const reporter = reporterRes.rows[0];
    invariant(reporter?.id, "buyer seed data is required");

    await client.query(
      `drop index if exists "Complaint_status_created_at_id_idx"`,
    );
    await client.query(
      `drop index if exists "Complaint_listing_status_created_at_id_idx"`,
    );
    await client.query(
      `drop index if exists "MarketplaceListing_type_status_moderation_created_id_idx"`,
    );

    await client.query(
      `delete from "Complaint" where complaint_type = $1`,
      [BENCHMARK_COMPLAINT_TYPE],
    );
    await client.query(
      `delete from "MarketplaceListing"
        where title = $1`,
      [BENCHMARK_LISTING_TITLE_PREFIX],
    );

    await client.query(
      `insert into "Complaint"
        (public_id, created_at, status, complaint_type, listing_id, seller_id, reporter_id, description, evidence)
       select
        ('PERF-' || $1::text || '-' || gs::text),
        now() - make_interval(mins => gs),
        case
          when gs % 4 = 0 then 'NEW'::"ComplaintStatus"
          when gs % 4 = 1 then 'PENDING'::"ComplaintStatus"
          when gs % 4 = 2 then 'APPROVED'::"ComplaintStatus"
          else 'REJECTED'::"ComplaintStatus"
        end,
        $2,
        ($3::int[])[1 + ((gs - 1) % cardinality($3::int[]))],
        ($4::int[])[1 + ((gs - 1) % cardinality($4::int[]))],
        $5,
        'stage9 synthetic complaint',
        null
       from generate_series(1, $6) as gs`,
      [
        benchmarkKey,
        BENCHMARK_COMPLAINT_TYPE,
        listingIds,
        listingSellerIds,
        reporter.id,
        BENCHMARK_COMPLAINT_COUNT,
      ],
    );
    await client.query(
      `insert into "MarketplaceListing"
        (public_id, seller_id, type, title, description, price, condition, status, moderation_status, views, shipping_by_seller, created_at, updated_at)
       select
        ('PERF-LST-' || $1::text || '-' || gs::text),
        $2,
        'PRODUCT'::"ListingType",
        $3,
        'stage9 synthetic listing',
        1000 + (gs % 500),
        'NEW'::"ListingCondition",
        'ACTIVE'::"ListingStatus",
        'APPROVED'::"ModerationStatus",
        0,
        true,
        now() - make_interval(secs => gs),
        now()
       from generate_series(1, $4) as gs`,
      [benchmarkKey, targetSellerId, BENCHMARK_LISTING_TITLE_PREFIX, BENCHMARK_LISTING_COUNT],
    );

    await client.query(`ANALYZE "Complaint"`);
    await client.query(`ANALYZE "MarketplaceListing"`);

    const queryComplaintsList = `
      select id, public_id, created_at
      from "Complaint"
      where status = 'NEW'
      order by created_at desc, id desc
      limit 50
    `;

    const queryListingOpenComplaints = `
      select id, public_id, created_at
      from "Complaint"
      where listing_id = $1
        and status in ('NEW', 'PENDING')
      order by created_at asc, id asc
    `;
    const queryCatalogList = `
      select id, public_id, created_at
      from "MarketplaceListing"
      where type = 'PRODUCT'
        and status = 'ACTIVE'
        and moderation_status = 'APPROVED'
      order by created_at desc, id desc
      limit 100
    `;

    const beforeList = await runExplain(client, queryComplaintsList);
    const beforeListing = await runExplain(client, queryListingOpenComplaints, [targetListingId]);
    const beforeCatalogList = await runExplain(client, queryCatalogList);

    await client.query(
      `create index if not exists "Complaint_status_created_at_id_idx"
         on "Complaint" (status, created_at desc, id desc)`,
    );
    await client.query(
      `create index if not exists "Complaint_listing_status_created_at_id_idx"
         on "Complaint" (listing_id, status, created_at desc, id desc)`,
    );
    await client.query(
      `create index if not exists "MarketplaceListing_type_status_moderation_created_id_idx"
         on "MarketplaceListing" (type, status, moderation_status, created_at desc, id desc)`,
    );
    await client.query(`ANALYZE "Complaint"`);
    await client.query(`ANALYZE "MarketplaceListing"`);

    const afterList = await runExplain(client, queryComplaintsList);
    const afterListing = await runExplain(client, queryListingOpenComplaints, [targetListingId]);
    const afterCatalogList = await runExplain(client, queryCatalogList);

    const report = {
      benchmark: {
        insertedComplaints: BENCHMARK_COMPLAINT_COUNT,
        insertedListings: BENCHMARK_LISTING_COUNT,
        complaintType: BENCHMARK_COMPLAINT_TYPE,
        listingTitle: BENCHMARK_LISTING_TITLE_PREFIX,
        benchmarkKey,
      },
      before: {
        complaintsList: beforeList,
        listingOpenComplaints: beforeListing,
        catalogList: beforeCatalogList,
      },
      after: {
        complaintsList: afterList,
        listingOpenComplaints: afterListing,
        catalogList: afterCatalogList,
      },
      deltas: {
        complaintsListExecutionMs:
          afterList.executionTimeMs - beforeList.executionTimeMs,
        listingOpenComplaintsExecutionMs:
          afterListing.executionTimeMs - beforeListing.executionTimeMs,
        catalogListExecutionMs:
          afterCatalogList.executionTimeMs - beforeCatalogList.executionTimeMs,
      },
    };

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await client.query(
      `delete from "Complaint" where complaint_type = $1`,
      [BENCHMARK_COMPLAINT_TYPE],
    );
    await client.query(
      `delete from "MarketplaceListing"
        where title = $1`,
      [BENCHMARK_LISTING_TITLE_PREFIX],
    );
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
