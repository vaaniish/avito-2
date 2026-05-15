import "dotenv/config";
import { prisma } from "../../backend/src/lib/prisma";
import { importCatalogSearchRulePresets } from "../../backend/src/modules/catalog/catalog-search.shared";

async function main() {
  const result = await importCatalogSearchRulePresets(prisma);
  console.log(`Catalog search preset import finished: ${result.rulesCreated} rule candidates processed.`);
}

main()
  .catch((error) => {
    console.error("Failed to import catalog search presets:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
