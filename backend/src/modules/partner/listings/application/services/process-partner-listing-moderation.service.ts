import { logger } from "../../../../../lib/logger";
import { boundedPositiveInteger } from "../../../../../lib/runtime-config";
import {
  evaluateListingModeration,
  type ImageModerationSignal,
} from "../../../listing-moderation";
import type {
  PartnerListingModerationJob,
  PartnerListingsNotificationPort,
  PartnerListingsWriteRepositoryPort,
} from "../../domain/partner-listings.types";

export class ProcessPartnerListingModerationService {
  private readonly queue: PartnerListingModerationJob[] = [];
  private readonly idleResolvers = new Set<() => void>();
  private active = 0;
  private stopping = false;

  constructor(
    private readonly repository: PartnerListingsWriteRepositoryPort,
    private readonly notifications: PartnerListingsNotificationPort,
    private readonly maxConcurrency = boundedPositiveInteger(
      "LISTING_MODERATION_CONCURRENCY",
      4,
      1,
      20,
    ),
  ) {}

  schedule(job: PartnerListingModerationJob | null) {
    if (!job) return;
    if (this.stopping) {
      logger.warn("listing_moderation_job_ignored_during_shutdown", {
        listingPublicId: job.listingPublicId,
      });
      return;
    }
    this.queue.push(job);
    this.drain();
  }

  snapshot() {
    return {
      queued: this.queue.length,
      active: this.active,
      configuredConcurrency: this.maxConcurrency,
    };
  }

  async stop(): Promise<void> {
    this.stopping = true;
    const discarded = this.queue.splice(0).length;
    if (discarded > 0) logger.warn("listing_moderation_queue_discarded_on_shutdown", { discarded });
    if (this.active === 0) return;
    await new Promise<void>((resolve) => this.idleResolvers.add(resolve));
  }

  private drain(): void {
    while (!this.stopping && this.active < this.maxConcurrency) {
      const job = this.queue.shift();
      if (!job) break;
      this.active += 1;
      setImmediate(() => {
        void this.execute(job)
          .catch((error) => logger.error("async_listing_moderation_job_failed", { error }))
          .finally(() => {
            this.active = Math.max(0, this.active - 1);
            this.drain();
            if (this.active === 0 && (this.stopping || this.queue.length === 0)) {
              for (const resolve of this.idleResolvers) resolve();
              this.idleResolvers.clear();
            }
          });
      });
    }
  }

  async execute(job: PartnerListingModerationJob) {
    const seller = await this.repository.loadSellerModerationContext({
      sellerId: job.sellerId,
    });

    const moderationDecision = await evaluateListingModeration({
      title: job.title,
      description: job.description,
      category: job.category,
      price: job.price,
      imageUrl: job.imageUrl,
      imageModerationSignals: job.imageModerationSignals as ImageModerationSignal[],
      seller,
    });

    const reasonCode =
      moderationDecision.moderationStatus === "APPROVED"
        ? "AUTO_APPROVE_NO_FLAGS"
        : moderationDecision.moderationStatus === "REJECTED"
          ? "AUTO_REJECT_HIGH_CONFIDENCE_VIOLATION"
          : "AUTO_REVIEW_FLAGGED_BY_RULES_OR_AI";

    const result = await this.repository.applyAutoModerationDecision({
      listingId: job.listingId,
      moderationStatus: moderationDecision.moderationStatus,
      listingStatus: moderationDecision.listingStatus,
      reasonCode,
      reasonNote: moderationDecision.reason,
      riskScore: Math.round(moderationDecision.riskScore),
      signals: moderationDecision.signals,
      aiUsed: moderationDecision.aiUsed,
      imageModerationSignals: job.imageModerationSignals,
    });

    if (!result.applied) {
      return;
    }

    await this.notifications.notifySellerAboutModerationDecision({
      sellerId: job.sellerId,
      listingPublicId: job.listingPublicId,
      title: job.title,
      moderationStatus: moderationDecision.moderationStatus,
      reasonNote: moderationDecision.reason,
      reasonCode,
    });

    if (moderationDecision.moderationStatus === "PENDING") {
      await this.notifications.notifyAdminsAboutManualModeration({
        title: job.title,
      });
    }
  }
}
