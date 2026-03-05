import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const reviews = await prisma.listingReview.findMany();
  console.log(JSON.stringify(reviews, null, 2));
}

main().finally(async () => {
  await prisma.$disconnect();
});
