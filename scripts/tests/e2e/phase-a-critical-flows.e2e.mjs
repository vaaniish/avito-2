import { randomUUID } from "node:crypto";
import "dotenv/config";
import pg from "pg";

const { Client } = pg;

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3001";
const API_BASE = `${BASE_URL.replace(/\/+$/, "")}/api`;
const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://user:password@localhost:5433/avito-db-dev?schema=public";

const report = [];

function record(name, ok, details = "") {
  report.push({ name, ok, details });
}

function invariant(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isSafeDatabaseUrl(url) {
  const normalized = url.toLowerCase();
  return (
    normalized.includes("localhost") ||
    normalized.includes("127.0.0.1") ||
    normalized.includes("postgres")
  );
}

function authHeaders(token) {
  return {
    authorization: `Bearer ${token}`,
  };
}

async function apiRequest(method, path, options = {}) {
  const {
    token,
    headers = {},
    body,
    expected = [200],
  } = options;

  const mergedHeaders = {
    ...headers,
  };
  if (token) {
    Object.assign(mergedHeaders, authHeaders(token));
  }
  if (
    body !== undefined &&
    !Object.keys(mergedHeaders).some((key) => key.toLowerCase() === "content-type")
  ) {
    mergedHeaders["content-type"] = "application/json";
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: mergedHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const raw = await response.text();
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = raw;
  }

  if (!expected.includes(response.status)) {
    throw new Error(
      `${method} ${path} -> ${response.status}\n${typeof data === "string" ? data : JSON.stringify(data, null, 2)}`,
    );
  }

  return { status: response.status, data, headers: response.headers };
}

async function runStep(name, fn) {
  try {
    const details = await fn();
    record(name, true, details ?? "");
  } catch (error) {
    record(name, false, error instanceof Error ? error.message : String(error));
  }
}

async function login(email, password) {
  const response = await apiRequest("POST", "/auth/login", {
    headers: { "content-type": "application/json" },
    body: { email, password },
    expected: [200],
  });

  invariant(typeof response.data?.sessionToken === "string", `sessionToken missing for ${email}`);
  invariant(typeof response.data?.user?.id === "number", `user.id missing for ${email}`);

  return {
    token: response.data.sessionToken,
    user: response.data.user,
  };
}

async function ensureCheckoutPolicyRejectedWithoutAcceptance(params) {
  const { db, buyerId, buyerToken } = params;
  const policyRes = await apiRequest("GET", "/public/policy/current?scope=checkout", {
    expected: [200],
  });
  const policyId = policyRes.data?.id;
  invariant(typeof policyId === "string" && policyId.length > 0, "checkout policy id missing");

  await db.query(
    `DELETE FROM "PolicyAcceptance"
     WHERE user_id = $1
       AND policy_id IN (
         SELECT id FROM "PlatformPolicy" WHERE scope = 'CHECKOUT'
       )`,
    [buyerId],
  );

  const listings = await apiRequest("GET", "/catalog/listings?type=products&limit=10&offset=0", {
    expected: [200],
  });
  const listing = Array.isArray(listings.data) ? listings.data[0] : null;
  invariant(typeof listing?.id === "string", "No listing found for checkout scenario");

  const denied = await apiRequest("POST", "/profile/orders", {
    token: buyerToken,
    headers: { "Idempotency-Key": randomUUID() },
    body: {
      items: [{ listingId: listing.id, quantity: 1 }],
      deliveryType: "pickup",
      paymentMethod: "card",
    },
    expected: [412],
  });
  invariant(typeof denied.data?.policy?.id === "string", "412 must include policy descriptor");

  const accepted = await apiRequest("POST", "/profile/policy-acceptance", {
    token: buyerToken,
    body: {
      scope: "checkout",
      policyId,
    },
    expected: [201],
  });
  invariant(accepted.data?.success === true, "checkout policy acceptance failed");

  const checkout = await apiRequest("POST", "/profile/orders", {
    token: buyerToken,
    headers: { "Idempotency-Key": randomUUID() },
    body: {
      items: [{ listingId: listing.id, quantity: 1 }],
      deliveryType: "pickup",
      paymentMethod: "card",
    },
    expected: [201],
  });
  const orderCount = Array.isArray(checkout.data?.orders) ? checkout.data.orders.length : 0;
  invariant(orderCount > 0, "checkout did not produce orders");

  return `policy=${policyId}, listing=${listing.id}, orders=${orderCount}`;
}

async function resetPartnershipApplicant(db, email) {
  const userRes = await db.query(
    `SELECT id
     FROM "AppUser"
     WHERE email = $1
     LIMIT 1`,
    [email],
  );
  const userId = Number(userRes.rows[0]?.id ?? 0);
  invariant(Number.isInteger(userId) && userId > 0, `Applicant not found: ${email}`);

  await db.query(
    `UPDATE "AppUser"
     SET role = 'BUYER',
         status = 'ACTIVE',
         blocked_until = NULL,
         block_reason = NULL,
         updated_at = NOW()
     WHERE id = $1`,
    [userId],
  );

  await db.query(`DELETE FROM "SellerProfile" WHERE user_id = $1`, [userId]);
  await db.query(
    `DELETE FROM "PolicyAcceptance"
     WHERE user_id = $1
       AND policy_id IN (
         SELECT id FROM "PlatformPolicy" WHERE scope = 'PARTNERSHIP'
       )`,
    [userId],
  );

  return userId;
}

async function main() {
  if (!isSafeDatabaseUrl(DATABASE_URL)) {
    throw new Error(
      `Refusing to run phase-a e2e against non-local database: ${DATABASE_URL}`,
    );
  }

  const db = new Client({ connectionString: DATABASE_URL });
  await db.connect();

  try {
    await runStep("health endpoints", async () => {
      const healthRes = await fetch(`${BASE_URL}/health`);
      const readyRes = await fetch(`${BASE_URL}/health/ready`);

      invariant(healthRes.status === 200, "health status is not 200");
      invariant(readyRes.status === 200, "ready status is not 200");

      const healthBody = await healthRes.json();
      const readyBody = await readyRes.json();
      invariant(healthBody?.ok === true, "health payload malformed");
      invariant(readyBody?.ok === true && readyBody?.db === "up", "ready payload malformed");

      return "health=ok, ready=ok";
    });

    await runStep("checkout with policy acceptance", async () => {
      const buyer = await login("buyer4@ecomm.local", "buyer123");
      return ensureCheckoutPolicyRejectedWithoutAcceptance({
        db,
        buyerId: buyer.user.id,
        buyerToken: buyer.token,
      });
    });

    await runStep("partnership request -> admin approve -> seller access", async () => {
      const applicantEmail = "buyer2@ecomm.local";
      const applicantId = await resetPartnershipApplicant(db, applicantEmail);

      const applicant = await login(applicantEmail, "buyer123");
      const admin = await login("admin@ecomm.local", "admin123");

      const beforeAccess = await apiRequest("GET", "/partner/payout-profile", {
        token: applicant.token,
        expected: [403],
      });
      invariant(typeof beforeAccess.data?.error === "string", "expected forbidden before approval");

      const policyRes = await apiRequest("GET", "/public/policy/current?scope=partnership", {
        expected: [200],
      });
      const policyId = policyRes.data?.id;
      invariant(typeof policyId === "string" && policyId.length > 0, "partnership policy missing");

      const beforePolicyAcceptance = await apiRequest("POST", "/profile/partnership-requests", {
        token: applicant.token,
        body: {
          sellerType: "ip",
          name: "ИП E2E Applicant",
          email: applicantEmail,
          contact: "+79005550100",
          link: `https://example.com/e2e-applicant-${Date.now()}`,
          category: "electronics_repair",
          inn: "7701234567",
          geography: "Москва",
          socialProfile: "https://t.me/e2e_applicant",
          credibility: "Опыт 4 года",
          whyUs: "Планируем продажи восстановленной электроники",
        },
        expected: [412],
      });
      invariant(
        typeof beforePolicyAcceptance.data?.policy?.id === "string",
        "expected policy hint when partnership policy is not accepted",
      );

      const accepted = await apiRequest("POST", "/profile/policy-acceptance", {
        token: applicant.token,
        body: {
          scope: "partnership",
          policyId,
        },
        expected: [201],
      });
      invariant(accepted.data?.success === true, "partnership policy acceptance failed");

      const created = await apiRequest("POST", "/profile/partnership-requests", {
        token: applicant.token,
        body: {
          sellerType: "ip",
          name: "ИП E2E Applicant",
          email: applicantEmail,
          contact: "+79005550100",
          link: `https://example.com/e2e-applicant-${Date.now()}`,
          category: "electronics_repair",
          inn: "7701234567",
          geography: "Москва",
          socialProfile: "https://t.me/e2e_applicant",
          credibility: "Опыт 4 года",
          whyUs: "Планируем продажи восстановленной электроники",
        },
        expected: [201],
      });
      const requestId = created.data?.request_id;
      invariant(typeof requestId === "string" && requestId.length > 0, "partnership request id missing");

      const approved = await apiRequest(
        "PATCH",
        `/admin/partnership-requests/${encodeURIComponent(requestId)}`,
        {
          token: admin.token,
          body: {
            status: "approved",
            adminNote: "phase-a e2e approve",
          },
          expected: [200],
        },
      );
      invariant(approved.data?.success === true, "admin approve failed");

      const afterAccess = await apiRequest("GET", "/partner/payout-profile", {
        token: applicant.token,
        expected: [200],
      });
      invariant(
        Object.prototype.hasOwnProperty.call(afterAccess.data, "profile"),
        "seller access payload malformed after approval",
      );

      return `applicant=${applicantId}, request=${requestId}, status=${approved.data?.status ?? "unknown"}`;
    });

    await runStep("payout profile submit -> admin verify", async () => {
      const seller = await login("seller1@ecomm.local", "seller123");
      const admin = await login("admin@ecomm.local", "admin123");

      const submitted = await apiRequest("PUT", "/partner/payout-profile", {
        token: seller.token,
        body: {
          legalType: "COMPANY",
          legalName: "ООО Тех Поинт",
          taxId: "7701234567",
          bankAccount: "40702810900000000001",
          bankBic: "044525225",
          correspondentAccount: "30101810400000000225",
          bankName: "ПАО Сбербанк",
          recipientName: "ООО Тех Поинт",
        },
        expected: [200],
      });
      invariant(submitted.data?.success === true, "payout profile submit failed");
      invariant(submitted.data?.profile?.status === "pending", "payout profile should be pending after submit");

      const payoutProfileId = submitted.data?.profile?.id;
      invariant(typeof payoutProfileId === "string" && payoutProfileId.length > 0, "payout profile id missing");

      const verified = await apiRequest(
        "PATCH",
        `/admin/payout-profiles/${encodeURIComponent(payoutProfileId)}`,
        {
          token: admin.token,
          body: {
            status: "verified",
          },
          expected: [200],
        },
      );
      invariant(verified.data?.success === true, "admin verify payout profile failed");

      const sellerView = await apiRequest("GET", "/partner/payout-profile", {
        token: seller.token,
        expected: [200],
      });
      invariant(sellerView.data?.profile?.status === "verified", "seller payout profile must be verified");

      return `payout=${payoutProfileId}, status=${sellerView.data.profile.status}`;
    });
  } finally {
    await db.end();
  }

  const passed = report.filter((item) => item.ok);
  const failed = report.filter((item) => !item.ok);

  console.log("\nPHASE A CRITICAL E2E REPORT");
  console.log("===========================");
  for (const item of report) {
    console.log(`${item.ok ? "PASS" : "FAIL"} | ${item.name}`);
    if (item.details) {
      console.log(`  ${item.details}`);
    }
  }
  console.log("---------------------------");
  console.log(`Passed: ${passed.length}`);
  console.log(`Failed: ${failed.length}`);

  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
