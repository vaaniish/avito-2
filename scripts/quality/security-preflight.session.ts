import "dotenv/config";
import { assertRuntimeConfiguration } from "../../backend/src/lib/runtime-config";

function main(): void {
  const saved = { ...process.env };
  try {
    process.env.NODE_ENV = "production";
    process.env.CORS_ALLOWED_ORIGINS = "https://preflight.example.com";
    process.env.DATABASE_URL = "postgresql://preflight_app:a-unique-preflight-password@127.0.0.1:5432/preflight";
    for (const optionalCredential of [
      "YOOKASSA_SHOP_ID",
      "YOOKASSA_SECRET_KEY",
      "YOOKASSA_WEBHOOK_TOKEN",
      "DADATA_API_KEY",
      "DADATA_SECRET_KEY",
      "YANDEX_DELIVERY_TOKEN",
    ]) delete process.env[optionalCredential];
    for (const obsolete of [
      "SESSION_TOKEN_SECRET",
      "SESSION_TOKEN_ISSUER",
      "SESSION_TOKEN_AUDIENCE",
      "SESSION_TOKEN_TTL_MS",
    ]) delete process.env[obsolete];
    assertRuntimeConfiguration();
  } finally {
    for (const key of Object.keys(process.env)) {
      if (!(key in saved)) delete process.env[key];
    }
    Object.assign(process.env, saved);
  }
  console.log("[security-preflight] PASS: production runtime configuration is valid");
}

main();
