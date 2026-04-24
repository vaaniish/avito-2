-- CreateTable
CREATE TABLE "CheckoutIdempotencyKey" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "actor_user_id" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response_status" INTEGER,
    "response_body" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckoutIdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CheckoutIdempotencyKey_public_id_key" ON "CheckoutIdempotencyKey"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "CheckoutIdempotency_actor_action_key_unique" ON "CheckoutIdempotencyKey"("actor_user_id", "action", "idempotency_key");

-- CreateIndex
CREATE INDEX "CheckoutIdempotencyKey_created_at_idx" ON "CheckoutIdempotencyKey"("created_at");

-- AddForeignKey
ALTER TABLE "CheckoutIdempotencyKey"
ADD CONSTRAINT "CheckoutIdempotencyKey_actor_user_id_fkey"
FOREIGN KEY ("actor_user_id")
REFERENCES "AppUser"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
