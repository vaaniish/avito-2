-- Align legacy text-based schema with current Prisma schema without data loss.

-- Create missing enum types if they do not exist.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UserRole') THEN
    CREATE TYPE "UserRole" AS ENUM ('BUYER', 'SELLER', 'ADMIN');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UserStatus') THEN
    CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'BLOCKED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NotificationType') THEN
    CREATE TYPE "NotificationType" AS ENUM ('NEW_QUESTION', 'ORDER_STATUS', 'SYSTEM', 'INFO');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ListingType') THEN
    CREATE TYPE "ListingType" AS ENUM ('PRODUCT', 'SERVICE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ListingCondition') THEN
    CREATE TYPE "ListingCondition" AS ENUM ('NEW', 'USED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ListingStatus') THEN
    CREATE TYPE "ListingStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'MODERATION');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ModerationStatus') THEN
    CREATE TYPE "ModerationStatus" AS ENUM ('APPROVED', 'REJECTED', 'PENDING');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'QuestionStatus') THEN
    CREATE TYPE "QuestionStatus" AS ENUM ('PENDING', 'ANSWERED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OrderStatus') THEN
    CREATE TYPE "OrderStatus" AS ENUM ('CREATED', 'PAID', 'PROCESSING', 'PREPARED', 'SHIPPED', 'DELIVERED', 'COMPLETED', 'CANCELLED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DeliveryType') THEN
    CREATE TYPE "DeliveryType" AS ENUM ('PICKUP', 'DELIVERY');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TransactionStatus') THEN
    CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'HELD', 'SUCCESS', 'FAILED', 'CANCELLED', 'REFUNDED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentProvider') THEN
    CREATE TYPE "PaymentProvider" AS ENUM ('CASH', 'YOOMONEY', 'STRIPE', 'OTHER');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ComplaintStatus') THEN
    CREATE TYPE "ComplaintStatus" AS ENUM ('NEW', 'PENDING', 'APPROVED', 'REJECTED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'KycStatus') THEN
    CREATE TYPE "KycStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SellerType') THEN
    CREATE TYPE "SellerType" AS ENUM ('COMPANY', 'PRIVATE', 'INDIVIDUAL');
  END IF;
END $$;

-- Convert legacy text columns to enum columns.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'AppUser' AND column_name = 'role' AND udt_name = 'text'
  ) THEN
    ALTER TABLE "AppUser"
      ALTER COLUMN "role" TYPE "UserRole"
      USING UPPER("role")::"UserRole";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'AppUser' AND column_name = 'status' AND udt_name = 'text'
  ) THEN
    ALTER TABLE "AppUser" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "AppUser"
      ALTER COLUMN "status" TYPE "UserStatus"
      USING UPPER("status")::"UserStatus";
    ALTER TABLE "AppUser" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Notification' AND column_name = 'type' AND udt_name = 'text'
  ) THEN
    ALTER TABLE "Notification"
      ALTER COLUMN "type" TYPE "NotificationType"
      USING UPPER("type")::"NotificationType";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'CatalogCategory' AND column_name = 'type' AND udt_name = 'text'
  ) THEN
    ALTER TABLE "CatalogCategory"
      ALTER COLUMN "type" TYPE "ListingType"
      USING UPPER("type")::"ListingType";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'MarketplaceListing' AND column_name = 'type' AND udt_name = 'text'
  ) THEN
    ALTER TABLE "MarketplaceListing"
      ALTER COLUMN "type" TYPE "ListingType"
      USING UPPER("type")::"ListingType";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'MarketplaceListing' AND column_name = 'condition' AND udt_name = 'text'
  ) THEN
    ALTER TABLE "MarketplaceListing"
      ALTER COLUMN "condition" TYPE "ListingCondition"
      USING UPPER("condition")::"ListingCondition";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'MarketplaceListing' AND column_name = 'status' AND udt_name = 'text'
  ) THEN
    ALTER TABLE "MarketplaceListing" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "MarketplaceListing"
      ALTER COLUMN "status" TYPE "ListingStatus"
      USING UPPER("status")::"ListingStatus";
    ALTER TABLE "MarketplaceListing" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'MarketplaceListing' AND column_name = 'moderation_status' AND udt_name = 'text'
  ) THEN
    ALTER TABLE "MarketplaceListing" ALTER COLUMN "moderation_status" DROP DEFAULT;
    ALTER TABLE "MarketplaceListing"
      ALTER COLUMN "moderation_status" TYPE "ModerationStatus"
      USING UPPER("moderation_status")::"ModerationStatus";
    ALTER TABLE "MarketplaceListing" ALTER COLUMN "moderation_status" SET DEFAULT 'APPROVED';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ListingQuestion' AND column_name = 'status' AND udt_name = 'text'
  ) THEN
    ALTER TABLE "ListingQuestion" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "ListingQuestion"
      ALTER COLUMN "status" TYPE "QuestionStatus"
      USING UPPER("status")::"QuestionStatus";
    ALTER TABLE "ListingQuestion" ALTER COLUMN "status" SET DEFAULT 'PENDING';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'MarketOrder' AND column_name = 'status' AND udt_name = 'text'
  ) THEN
    ALTER TABLE "MarketOrder" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "MarketOrder"
      ALTER COLUMN "status" TYPE "OrderStatus"
      USING UPPER("status")::"OrderStatus";
    ALTER TABLE "MarketOrder" ALTER COLUMN "status" SET DEFAULT 'CREATED';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'MarketOrder' AND column_name = 'delivery_type' AND udt_name = 'text'
  ) THEN
    ALTER TABLE "MarketOrder"
      ALTER COLUMN "delivery_type" TYPE "DeliveryType"
      USING UPPER("delivery_type")::"DeliveryType";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'PlatformTransaction' AND column_name = 'status' AND udt_name = 'text'
  ) THEN
    ALTER TABLE "PlatformTransaction"
      ALTER COLUMN "status" TYPE "TransactionStatus"
      USING UPPER("status")::"TransactionStatus";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'PlatformTransaction' AND column_name = 'payment_provider' AND udt_name = 'text'
  ) THEN
    ALTER TABLE "PlatformTransaction"
      ALTER COLUMN "payment_provider" TYPE "PaymentProvider"
      USING (
        CASE UPPER("payment_provider")
          WHEN 'CASH' THEN 'CASH'
          WHEN 'YOOMONEY' THEN 'YOOMONEY'
          WHEN 'STRIPE' THEN 'STRIPE'
          ELSE 'OTHER'
        END
      )::"PaymentProvider";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Complaint' AND column_name = 'status' AND udt_name = 'text'
  ) THEN
    ALTER TABLE "Complaint" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "Complaint"
      ALTER COLUMN "status" TYPE "ComplaintStatus"
      USING UPPER("status")::"ComplaintStatus";
    ALTER TABLE "Complaint" ALTER COLUMN "status" SET DEFAULT 'NEW';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'KycRequest' AND column_name = 'status' AND udt_name = 'text'
  ) THEN
    ALTER TABLE "KycRequest" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "KycRequest"
      ALTER COLUMN "status" TYPE "KycStatus"
      USING UPPER("status")::"KycStatus";
    ALTER TABLE "KycRequest" ALTER COLUMN "status" SET DEFAULT 'PENDING';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'PartnershipRequest' AND column_name = 'seller_type' AND udt_name = 'text'
  ) THEN
    ALTER TABLE "PartnershipRequest"
      ALTER COLUMN "seller_type" TYPE "SellerType"
      USING UPPER("seller_type")::"SellerType";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'OrderStatusHistory' AND column_name = 'from_status' AND udt_name = 'text'
  ) THEN
    ALTER TABLE "OrderStatusHistory"
      ALTER COLUMN "from_status" TYPE "OrderStatus"
      USING CASE WHEN "from_status" IS NULL THEN NULL ELSE UPPER("from_status")::"OrderStatus" END;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'OrderStatusHistory' AND column_name = 'to_status' AND udt_name = 'text'
  ) THEN
    ALTER TABLE "OrderStatusHistory"
      ALTER COLUMN "to_status" TYPE "OrderStatus"
      USING UPPER("to_status")::"OrderStatus";
  END IF;
END $$;

-- Create missing tables introduced in current schema.
CREATE TABLE IF NOT EXISTS "OrderStatusHistory" (
  "id" SERIAL NOT NULL,
  "order_id" INTEGER NOT NULL,
  "from_status" "OrderStatus",
  "to_status" "OrderStatus" NOT NULL,
  "changed_by_id" INTEGER,
  "reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderStatusHistory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id" SERIAL NOT NULL,
  "public_id" TEXT NOT NULL,
  "actor_user_id" INTEGER,
  "action" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "entity_public_id" TEXT,
  "details" JSONB,
  "ip_address" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "OrderStatusHistory_order_id_created_at_idx"
  ON "OrderStatusHistory"("order_id", "created_at");
CREATE INDEX IF NOT EXISTS "OrderStatusHistory_changed_by_id_idx"
  ON "OrderStatusHistory"("changed_by_id");

CREATE UNIQUE INDEX IF NOT EXISTS "AuditLog_public_id_key"
  ON "AuditLog"("public_id");
CREATE INDEX IF NOT EXISTS "AuditLog_actor_user_id_created_at_idx"
  ON "AuditLog"("actor_user_id", "created_at");
CREATE INDEX IF NOT EXISTS "AuditLog_entity_type_entity_public_id_idx"
  ON "AuditLog"("entity_type", "entity_public_id");
CREATE INDEX IF NOT EXISTS "AuditLog_action_created_at_idx"
  ON "AuditLog"("action", "created_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OrderStatusHistory_order_id_fkey'
  ) THEN
    ALTER TABLE "OrderStatusHistory"
      ADD CONSTRAINT "OrderStatusHistory_order_id_fkey"
      FOREIGN KEY ("order_id") REFERENCES "MarketOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OrderStatusHistory_changed_by_id_fkey'
  ) THEN
    ALTER TABLE "OrderStatusHistory"
      ADD CONSTRAINT "OrderStatusHistory_changed_by_id_fkey"
      FOREIGN KEY ("changed_by_id") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AuditLog_actor_user_id_fkey'
  ) THEN
    ALTER TABLE "AuditLog"
      ADD CONSTRAINT "AuditLog_actor_user_id_fkey"
      FOREIGN KEY ("actor_user_id") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
