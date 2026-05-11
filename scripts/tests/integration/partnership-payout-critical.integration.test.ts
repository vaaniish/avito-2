import assert from "node:assert/strict";
import type { Server } from "node:http";
import { after, before, test } from "node:test";
import "dotenv/config";
import { app } from "../../../backend/src/app";
import { prisma } from "../../../backend/src/lib/prisma";

function isSafeDatabaseUrl(url: string | undefined): boolean {
  if (!url) return false;
  const normalized = url.toLowerCase();
  return (
    normalized.includes("localhost") ||
    normalized.includes("127.0.0.1") ||
    normalized.includes("postgres")
  );
}

const safeDb = isSafeDatabaseUrl(process.env.DATABASE_URL);
let server: Server | null = null;
let baseUrl = "";

before(async () => {
  if (!safeDb) return;

  server = await new Promise<Server>((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server?.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
  await prisma.$disconnect();
});

async function apiRequest(params: {
  method: "GET" | "POST" | "PATCH" | "PUT";
  path: string;
  token?: string;
  body?: unknown;
  expected: number;
}) {
  const response = await fetch(`${baseUrl}${params.path}`, {
    method: params.method,
    headers: {
      ...(params.body !== undefined ? { "content-type": "application/json" } : {}),
      ...(params.token ? { authorization: `Bearer ${params.token}` } : {}),
    },
    body: params.body === undefined ? undefined : JSON.stringify(params.body),
  });
  const payload = (await response.json()) as Record<string, unknown>;
  assert.equal(
    response.status,
    params.expected,
    `${params.method} ${params.path} -> ${response.status}: ${JSON.stringify(payload)}`,
  );
  return payload;
}

async function login(email: string, password: string): Promise<{ token: string; userId: number }> {
  const payload = await apiRequest({
    method: "POST",
    path: "/api/auth/login",
    expected: 200,
    body: { email, password },
  });
  assert.equal(typeof payload.sessionToken, "string");
  assert.equal(typeof payload.user?.id, "number");
  return {
    token: payload.sessionToken as string,
    userId: payload.user.id as number,
  };
}

async function resetApplicant(email: string): Promise<number> {
  const user = await prisma.appUser.findUnique({
    where: { email },
    select: { id: true },
  });
  assert.ok(user, `applicant not found: ${email}`);

  await prisma.sellerPayoutProfile.deleteMany({
    where: { seller_id: user.id },
  });
  await prisma.sellerProfile.deleteMany({
    where: { user_id: user.id },
  });
  await prisma.partnershipRequest.deleteMany({
    where: { user_id: user.id },
  });
  await prisma.policyAcceptance.deleteMany({
    where: {
      user_id: user.id,
      policy: {
        scope: "PARTNERSHIP",
      },
    },
  });
  await prisma.appUser.update({
    where: { id: user.id },
    data: {
      role: "BUYER",
      status: "ACTIVE",
      blocked_until: null,
      block_reason: null,
    },
  });

  return user.id;
}

test(
  "integration: partnership approval and payout verification persist access, audit and notifications",
  { skip: !safeDb },
  async () => {
    const applicantEmail = "buyer2@ecomm.local";
    const applicantId = await resetApplicant(applicantEmail);
    const applicant = await login(applicantEmail, "buyer123");
    const admin = await login("admin@ecomm.local", "admin123");

    const beforeNotifications = await prisma.notification.count({
      where: { user_id: applicantId },
    });

    const policy = await apiRequest({
      method: "GET",
      path: "/api/public/policy/current?scope=partnership",
      expected: 200,
    });
    assert.equal(typeof policy.id, "string");

    await apiRequest({
      method: "POST",
      path: "/api/profile/policy-acceptance",
      token: applicant.token,
      expected: 201,
      body: {
        scope: "partnership",
        policyId: policy.id,
      },
    });

    const requestPayload = await apiRequest({
      method: "POST",
      path: "/api/profile/partnership-requests",
      token: applicant.token,
      expected: 201,
      body: {
        sellerType: "company",
        name: "Integration Partner Flow",
        email: applicantEmail,
        contact: "+7 999 555 11 22",
        link: "https://integration-partner.example",
        category: "laptops",
        inn: "7707083893",
        geography: "Москва",
        socialProfile: "https://t.me/integration_partner",
        credibility:
          "Действующий магазин, документы поставщиков доступны, процесс диагностики и поддержки описан.",
        whyUs:
          "Планируем размещать ассортимент, поддерживать SLA и качественную коммуникацию с покупателями на платформе.",
      },
    });
    const requestId = requestPayload.request_id;
    assert.equal(typeof requestId, "string");

    await apiRequest({
      method: "PATCH",
      path: `/api/admin/partnership-requests/${encodeURIComponent(requestId as string)}`,
      token: admin.token,
      expected: 200,
      body: {
        status: "approved",
        adminNote: "Integration override before payout verification",
      },
    });

    const applicantAfterApproval = await prisma.appUser.findUnique({
      where: { id: applicantId },
      select: { role: true, status: true },
    });
    assert.equal(applicantAfterApproval?.role, "SELLER");
    assert.equal(applicantAfterApproval?.status, "ACTIVE");

    const sellerAccess = await apiRequest({
      method: "GET",
      path: "/api/partner/payout-profile",
      token: applicant.token,
      expected: 200,
    });
    assert.equal(sellerAccess.profile, null);

    const payoutSubmit = await apiRequest({
      method: "PUT",
      path: "/api/partner/payout-profile",
      token: applicant.token,
      expected: 200,
      body: {
        legalType: "COMPANY",
        legalName: "Integration Partner LLC",
        taxId: "7707083893",
        bankAccount: "40702810900000012345",
        bankBic: "044525225",
        correspondentAccount: "30101810400000000225",
        bankName: "АО Тест Банк",
        recipientName: "Integration Partner LLC",
      },
    });
    assert.equal(typeof payoutSubmit.profile?.id, "string");
    const payoutProfileId = payoutSubmit.profile?.id as string;

    await apiRequest({
      method: "PATCH",
      path: `/api/admin/payout-profiles/${encodeURIComponent(payoutProfileId)}`,
      token: admin.token,
      expected: 200,
      body: {
        status: "verified",
      },
    });

    const sellerView = await apiRequest({
      method: "GET",
      path: "/api/partner/payout-profile",
      token: applicant.token,
      expected: 200,
    });
    assert.equal(sellerView.profile?.status, "verified");

    const partnershipAudit = await prisma.auditLog.findFirst({
      where: {
        actor_user_id: admin.userId,
        action: "partnership_request.status_changed",
        entity_public_id: requestId as string,
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      select: { details: true },
    });
    assert.ok(partnershipAudit, "partnership audit row missing");

    const payoutAudit = await prisma.auditLog.findFirst({
      where: {
        actor_user_id: admin.userId,
        action: "seller.payout_profile.status_changed",
        entity_public_id: payoutProfileId,
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      select: { details: true },
    });
    assert.ok(payoutAudit, "payout audit row missing");

    const notifications = await prisma.notification.findMany({
      where: { user_id: applicantId },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      take: 5,
      select: {
        message: true,
        target_url: true,
      },
    });
    assert.ok(
      notifications.some(
        (item) => item.target_url === "/profile?tab=partner" && /заявка одобрена/i.test(item.message),
      ),
      "partnership approval notification missing",
    );
    assert.ok(
      notifications.some(
        (item) => item.target_url === "/profile?tab=partner" && /платёжный профиль подтверждён/i.test(item.message),
      ),
      "payout verification notification missing",
    );

    const afterNotifications = await prisma.notification.count({
      where: { user_id: applicantId },
    });
    assert.ok(afterNotifications >= beforeNotifications + 2);
  },
);
