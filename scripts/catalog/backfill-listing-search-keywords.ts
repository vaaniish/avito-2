import "dotenv/config";
import { prisma } from "../../backend/src/lib/prisma";
import { syncListingSearchKeywords } from "../../backend/src/modules/catalog/catalog-search.shared";

async function main() {
  const listings = await prisma.marketplaceListing.findMany({
    select: { id: true, public_id: true },
    orderBy: [{ id: "asc" }],
  });

  let processed = 0;
  for (const listing of listings) {
    await syncListingSearchKeywords({
      prismaClient: prisma,
      listingId: listing.id,
    });
    processed += 1;
    if (processed % 50 === 0) {
      console.log(`Processed ${processed}/${listings.length} listings...`);
    }
  }

  console.log(`Listing search keyword backfill finished: ${processed} listings processed.`);
}

main()
  .catch((error) => {
    console.error("Failed to backfill listing search keywords:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
