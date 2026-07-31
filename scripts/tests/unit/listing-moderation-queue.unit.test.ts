import assert from "node:assert/strict";
import test from "node:test";
import { ProcessPartnerListingModerationService } from "../../../backend/src/modules/partner/listings/application/services/process-partner-listing-moderation.service";

function job(index: number) {
  return { listingId: index, listingPublicId: `LST-${index}` } as any;
}

async function waitUntil(predicate: () => boolean, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("condition timed out");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

test("listing moderation queue bounds concurrent jobs", async () => {
  const service = new ProcessPartnerListingModerationService({} as any, {} as any, 2);
  let active = 0;
  let maxActive = 0;
  let completed = 0;
  service.execute = async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 20));
    active -= 1;
    completed += 1;
  };

  for (let index = 0; index < 8; index += 1) service.schedule(job(index));
  await waitUntil(() => completed === 8);

  assert.equal(maxActive, 2);
  assert.deepEqual(service.snapshot(), { queued: 0, active: 0, configuredConcurrency: 2 });
});

test("listing moderation shutdown discards queued work and waits for active jobs", async () => {
  const service = new ProcessPartnerListingModerationService({} as any, {} as any, 2);
  let completed = 0;
  service.execute = async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
    completed += 1;
  };

  for (let index = 0; index < 10; index += 1) service.schedule(job(index));
  await service.stop();

  assert.equal(completed, 2);
  assert.deepEqual(service.snapshot(), { queued: 0, active: 0, configuredConcurrency: 2 });
});
