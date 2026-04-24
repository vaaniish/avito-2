import assert from "node:assert/strict";
import { after } from "node:test";
import test from "node:test";
import "dotenv/config";
import { prisma } from "../../../backend/src/lib/prisma";
import {
  acceptPolicyForUser,
  getPolicyAcceptanceStatus,
  getActivePolicy,
} from "../../../backend/src/modules/policy/policy.shared";

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

after(async () => {
  await prisma.$disconnect();
});

test(
  "integration: checkout policy acceptance lifecycle",
  { skip: !safeDb },
  async () => {
    const user = await prisma.appUser.findUnique({
      where: {
        email: "buyer4@ecomm.local",
      },
      select: {
        id: true,
      },
    });
    assert.ok(user, "Test user buyer4@ecomm.local was not found");

    const policy = await getActivePolicy(prisma, "CHECKOUT");
    assert.ok(policy, "Active checkout policy was not found");

    await prisma.policyAcceptance.deleteMany({
      where: {
        user_id: user.id,
        policy_id: policy.id,
      },
    });

    const statusBefore = await getPolicyAcceptanceStatus({
      prisma,
      userId: user.id,
      scope: "CHECKOUT",
    });
    assert.equal(statusBefore.hasActivePolicy, true);
    assert.equal(statusBefore.accepted, false);

    const mismatch = await acceptPolicyForUser({
      prisma,
      userId: user.id,
      scope: "CHECKOUT",
      requestPolicyPublicId: "POL-CHECKOUT-OLD-VERSION",
      requestIp: "127.0.0.1",
      requestUserAgent: "integration-test-agent",
    });
    assert.equal(mismatch.ok, false);
    if (mismatch.ok) {
      assert.fail("Expected mismatch result to be not ok");
    }
    assert.equal(mismatch.code, "POLICY_VERSION_MISMATCH");

    const accepted = await acceptPolicyForUser({
      prisma,
      userId: user.id,
      scope: "CHECKOUT",
      requestPolicyPublicId: policy.public_id,
      requestIp: "127.0.0.1",
      requestUserAgent: "integration-test-agent",
    });
    assert.equal(accepted.ok, true);

    const statusAfter = await getPolicyAcceptanceStatus({
      prisma,
      userId: user.id,
      scope: "CHECKOUT",
    });
    assert.equal(statusAfter.hasActivePolicy, true);
    assert.equal(statusAfter.accepted, true);
    assert.ok(statusAfter.acceptedAt instanceof Date);

    const acceptanceRow = await prisma.policyAcceptance.findUnique({
      where: {
        policy_id_user_id: {
          policy_id: policy.id,
          user_id: user.id,
        },
      },
      select: {
        accepted_ip: true,
        accepted_ua: true,
      },
    });
    assert.ok(acceptanceRow, "Acceptance row was not persisted");
    assert.equal(acceptanceRow.accepted_ip, "127.0.0.1");
    assert.equal(acceptanceRow.accepted_ua, "integration-test-agent");
  },
);
