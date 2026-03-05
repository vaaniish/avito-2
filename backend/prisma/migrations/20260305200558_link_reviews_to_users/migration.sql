/*
  Warnings:

  - You are about to drop the column `author_name` on the `ListingReview` table. All the data in the column will be lost.
  - You are about to drop the column `avatar` on the `ListingReview` table. All the data in the column will be lost.
  - You are about to drop the column `date` on the `ListingReview` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[listing_id,author_id]` on the table `ListingReview` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `author_id` to the `ListingReview` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ListingReview" DROP COLUMN "author_name",
DROP COLUMN "avatar",
DROP COLUMN "date",
ADD COLUMN     "author_id" INTEGER NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "ListingReview_listing_id_author_id_key" ON "ListingReview"("listing_id", "author_id");

-- AddForeignKey
ALTER TABLE "ListingReview" ADD CONSTRAINT "ListingReview_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
