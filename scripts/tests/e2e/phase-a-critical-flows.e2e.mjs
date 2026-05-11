import { randomUUID } from "node:crypto";
import "dotenv/config";
import bcrypt from "bcrypt";
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

async function createUserFixture(db, params) {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  const password = params.password ?? "fixture123";
  const passwordHash = await bcrypt.hash(password, 4);
  const email = params.email ?? `${params.prefix.toLowerCase()}-${suffix}@ecomm.local`;
  const publicId = `${params.publicIdPrefix ?? params.prefix}-${suffix}`;
  const name = params.name ?? `${params.prefix} Test User`;

  const created = await db.query(
    `insert into "AppUser" (public_id, role, status, email, password, name, created_at, updated_at)
     values ($1, $2::"UserRole", 'ACTIVE', $3, $4, $5, NOW(), NOW())
     returning id, public_id, email`,
    [publicId, params.role, email, passwordHash, name],
  );

  return {
    id: created.rows[0].id,
    publicId: created.rows[0].public_id,
    email: created.rows[0].email,
    password,
  };
}

async function createListingFixture(db, params) {
  const publicId = `${params.prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  const created = await db.query(
    `insert into "MarketplaceListing"
      (public_id, seller_id, type, title, description, price, condition, status, moderation_status, created_at, updated_at)
     values ($1, $2, 'PRODUCT', $3, $4, $5, 'USED', 'ACTIVE', 'APPROVED', NOW(), NOW())
     returning id, public_id`,
    [publicId, params.sellerId, params.title, params.description ?? "Phase A complaint fixture", params.price ?? 1000],
  );

  return {
    id: created.rows[0].id,
    publicId: created.rows[0].public_id,
  };
}

async function createComplaintSeed(db, params) {
  const publicId = `${params.prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  const created = await db.query(
    `insert into "Complaint"
      (public_id, status, complaint_type, listing_id, seller_id, reporter_id, description, created_at)
     values ($1, $2::"ComplaintStatus", $3, $4, $5, $6, $7, NOW())
     returning id, public_id`,
    [
      publicId,
      params.status,
      params.complaintType ?? "phase_a_complaint_seed",
      params.listingId,
      params.sellerId,
      params.reporterId,
      params.description ?? "Phase A complaint seed",
    ],
  );

  return {
    id: created.rows[0].id,
    publicId: created.rows[0].public_id,
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
          credibility: "Опыт 4 года, собственная сервисная команда и гарантийный процесс",
          whyUs: "Планируем продажи восстановленной электроники с подтвержденным сервисом и гарантией",
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
          credibility: "Опыт 4 года, собственная сервисная команда и гарантийный процесс",
          whyUs: "Планируем продажи восстановленной электроники с подтвержденным сервисом и гарантией",
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

    await runStep("complaint create -> admin approve -> permanent cascade", async () => {
      const admin = await login("admin@ecomm.local", "admin123");
      const seller = await createUserFixture(db, {
        prefix: "PHASEA-CASCADE-SELLER",
        publicIdPrefix: "PHASEA-CASCADE-SELLER",
        role: "SELLER",
        password: "seller123",
      });
      const reporterPrimary = await createUserFixture(db, {
        prefix: "PHASEA-CASCADE-BUYER1",
        publicIdPrefix: "PHASEA-CASCADE-BUYER1",
        role: "BUYER",
        password: "buyer123",
      });
      const reporterRelated = await createUserFixture(db, {
        prefix: "PHASEA-CASCADE-BUYER2",
        publicIdPrefix: "PHASEA-CASCADE-BUYER2",
        role: "BUYER",
        password: "buyer123",
      });

      const seededReporters = [];
      for (let index = 0; index < 3; index += 1) {
        seededReporters.push(
          await createUserFixture(db, {
            prefix: `PHASEA-CASCADE-SEED-BUYER${index + 1}`,
            publicIdPrefix: `PHASEA-CASCADE-SEED-BUYER${index + 1}`,
            role: "BUYER",
            password: "buyer123",
          }),
        );
      }

      const listings = [];
      listings.push(
        await createListingFixture(db, {
          sellerId: seller.id,
          prefix: "PHASEA-CASCADE-LST-PRIMARY",
          title: "Phase A complaint primary listing",
        }),
      );
      listings.push(
        await createListingFixture(db, {
          sellerId: seller.id,
          prefix: "PHASEA-CASCADE-LST-RELATED",
          title: "Phase A complaint related listing",
        }),
      );
      for (let index = 0; index < 3; index += 1) {
        listings.push(
          await createListingFixture(db, {
            sellerId: seller.id,
            prefix: `PHASEA-CASCADE-LST-SEED-${index + 1}`,
            title: `Phase A complaint seed listing ${index + 1}`,
          }),
        );
      }

      try {
        for (let index = 0; index < seededReporters.length; index += 1) {
          await createComplaintSeed(db, {
            prefix: `PHASEA-CASCADE-APPROVED-${index + 1}`,
            status: "APPROVED",
            listingId: listings[index + 2].id,
            sellerId: seller.id,
            reporterId: seededReporters[index].id,
          });
        }

        const primaryBuyer = await login(reporterPrimary.email, reporterPrimary.password);
        const relatedBuyer = await login(reporterRelated.email, reporterRelated.password);

        const createdPrimary = await apiRequest(
          "POST",
          `/catalog/listings/${encodeURIComponent(listings[0].publicId)}/complaints`,
          {
            token: primaryBuyer.token,
            body: {
              complaintType: `phase_a_primary_${Date.now()}`,
              description: "Phase A primary complaint for permanent cascade verification",
            },
            expected: [201],
          },
        );
        const primaryComplaintId = createdPrimary.data?.id;
        invariant(typeof primaryComplaintId === "string", "primary complaint id missing");

        const createdRelated = await apiRequest(
          "POST",
          `/catalog/listings/${encodeURIComponent(listings[1].publicId)}/complaints`,
          {
            token: relatedBuyer.token,
            body: {
              complaintType: `phase_a_related_${Date.now()}`,
              description: "Phase A related complaint to verify seller-wide cascade behavior",
            },
            expected: [201],
          },
        );
        const relatedComplaintId = createdRelated.data?.id;
        invariant(typeof relatedComplaintId === "string", "related complaint id missing");

        const approval = await apiRequest(
          "PATCH",
          `/admin/complaints/${encodeURIComponent(primaryComplaintId)}/status`,
          {
            token: admin.token,
            headers: { "Idempotency-Key": randomUUID() },
            body: {
              status: "approved",
              actionTaken: "Phase A permanent complaint cascade",
            },
            expected: [200],
          },
        );

        invariant(approval.data?.status === "approved", "primary complaint was not approved");
        invariant(approval.data?.enforcement?.level === "permanent", "expected permanent sanction");
        invariant(
          Array.isArray(approval.data?.cascade?.cascadedComplaintIds) &&
            approval.data.cascade.cascadedComplaintIds.includes(relatedComplaintId),
          "related complaint was not cascaded",
        );

        const complaintStates = await db.query(
          `select public_id, status
           from "Complaint"
           where public_id = any($1::text[])`,
          [[primaryComplaintId, relatedComplaintId]],
        );
        const statusByComplaint = new Map(
          complaintStates.rows.map((row) => [row.public_id, String(row.status).toLowerCase()]),
        );
        invariant(statusByComplaint.get(primaryComplaintId) === "approved", "primary complaint db status mismatch");
        invariant(statusByComplaint.get(relatedComplaintId) === "approved", "related complaint db status mismatch");

        const sellerState = await db.query(
          `select status, blocked_until, block_reason
           from "AppUser"
           where id = $1`,
          [seller.id],
        );
        invariant(
          String(sellerState.rows[0]?.status ?? "").toLowerCase() === "blocked",
          "seller was not blocked after permanent sanction",
        );
        invariant(
          typeof sellerState.rows[0]?.block_reason === "string" &&
            sellerState.rows[0].block_reason.includes("Phase A permanent complaint cascade"),
          "seller block reason does not contain moderator note",
        );

        const listingState = await db.query(
          `select status, moderation_status
           from "MarketplaceListing"
           where public_id = $1`,
          [listings[0].publicId],
        );
        invariant(
          String(listingState.rows[0]?.status ?? "").toLowerCase() === "inactive",
          "primary listing should be inactive after approved complaint",
        );
        invariant(
          String(listingState.rows[0]?.moderation_status ?? "").toLowerCase() === "rejected",
          "primary listing moderation should be rejected after approved complaint",
        );

        const sellerNotifications = await db.query(
          `select target_url
           from "Notification"
           where user_id = $1
           order by created_at desc, id desc
           limit 5`,
          [seller.id],
        );
        invariant(
          sellerNotifications.rows.some((row) => row.target_url === "/profile?tab=partner"),
          "seller complaint notification target url is missing",
        );

        const reporterNotifications = await db.query(
          `select target_url
           from "Notification"
           where user_id = $1
           order by created_at desc, id desc
           limit 5`,
          [reporterPrimary.id],
        );
        invariant(
          reporterNotifications.rows.some(
            (row) => row.target_url === `/products/${encodeURIComponent(listings[0].publicId)}`,
          ),
          "reporter complaint notification target url is missing",
        );

        const audit = await db.query(
          `select details
           from "AuditLog"
           where action = 'complaint.status_changed'
             and entity_public_id = $1
           order by created_at desc, id desc
           limit 1`,
          [primaryComplaintId],
        );
        invariant(audit.rows.length === 1, "complaint audit row missing");
        invariant(
          Array.isArray(audit.rows[0].details?.cascadedComplaintIds) &&
            audit.rows[0].details.cascadedComplaintIds.includes(relatedComplaintId),
          "audit row does not contain cascaded complaint ids",
        );

        return `primary=${primaryComplaintId}, related=${relatedComplaintId}, cascade=${approval.data.cascade.cascadedComplaintIds.length}`;
      } finally {
        const fixtureUserIds = [
          seller.id,
          reporterPrimary.id,
          reporterRelated.id,
          ...seededReporters.map((item) => item.id),
        ];
        await db.query(
          `delete from "AdminIdempotencyKey"
           where actor_user_id = $1
             and action = 'complaint.status_changed'`,
          [admin.user.id],
        );
        await db.query(
          `delete from "AppUser"
           where id = any($1::int[])`,
          [fixtureUserIds],
        );
      }
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
