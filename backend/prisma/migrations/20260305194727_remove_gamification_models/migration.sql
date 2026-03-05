/*
  Warnings:

  - You are about to drop the `Achievement` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `LoyaltyLevel` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Order` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Partner` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PartnerAchievement` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `XpAccrual` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_loyalty_level_id_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_partner_id_fkey";

-- DropForeignKey
ALTER TABLE "PartnerAchievement" DROP CONSTRAINT "PartnerAchievement_achievement_id_fkey";

-- DropForeignKey
ALTER TABLE "PartnerAchievement" DROP CONSTRAINT "PartnerAchievement_partner_id_fkey";

-- DropForeignKey
ALTER TABLE "XpAccrual" DROP CONSTRAINT "XpAccrual_order_id_fkey";

-- DropTable
DROP TABLE "Achievement";

-- DropTable
DROP TABLE "LoyaltyLevel";

-- DropTable
DROP TABLE "Order";

-- DropTable
DROP TABLE "Partner";

-- DropTable
DROP TABLE "PartnerAchievement";

-- DropTable
DROP TABLE "XpAccrual";
