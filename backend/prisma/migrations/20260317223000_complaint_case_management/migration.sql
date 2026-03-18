-- CreateTable
CREATE TABLE "ComplaintEvent" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "complaint_id" INTEGER NOT NULL,
    "actor_user_id" INTEGER,
    "event_type" TEXT NOT NULL,
    "from_status" "ComplaintStatus",
    "to_status" "ComplaintStatus",
    "note" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplaintEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminIdempotencyKey" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "actor_user_id" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response_status" INTEGER,
    "response_body" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminIdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ComplaintEvent_public_id_key" ON "ComplaintEvent"("public_id");

-- CreateIndex
CREATE INDEX "ComplaintEvent_complaint_id_created_at_idx" ON "ComplaintEvent"("complaint_id", "created_at");

-- CreateIndex
CREATE INDEX "ComplaintEvent_actor_user_id_created_at_idx" ON "ComplaintEvent"("actor_user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "AdminIdempotencyKey_public_id_key" ON "AdminIdempotencyKey"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "AdminIdempotency_actor_action_key_unique" ON "AdminIdempotencyKey"("actor_user_id", "action", "idempotency_key");

-- CreateIndex
CREATE INDEX "AdminIdempotencyKey_created_at_idx" ON "AdminIdempotencyKey"("created_at");

-- AddForeignKey
ALTER TABLE "ComplaintEvent" ADD CONSTRAINT "ComplaintEvent_complaint_id_fkey" FOREIGN KEY ("complaint_id") REFERENCES "Complaint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintEvent" ADD CONSTRAINT "ComplaintEvent_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminIdempotencyKey" ADD CONSTRAINT "AdminIdempotencyKey_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
