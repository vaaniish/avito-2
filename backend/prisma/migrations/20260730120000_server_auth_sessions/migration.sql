CREATE TABLE "AuthSession" (
    "id" UUID NOT NULL,
    "user_id" INTEGER NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "csrf_token" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuthSession_token_hash_key" ON "AuthSession"("token_hash");
CREATE INDEX "AuthSession_user_id_revoked_at_expires_at_idx" ON "AuthSession"("user_id", "revoked_at", "expires_at");
CREATE INDEX "AuthSession_expires_at_idx" ON "AuthSession"("expires_at");

ALTER TABLE "AuthSession"
ADD CONSTRAINT "AuthSession_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "AppUser"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
