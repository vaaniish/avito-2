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
  constructor(
    private readonly repository: PartnerListingsWriteRepositoryPort,
    private readonly notifications: PartnerListingsNotificationPort,
  ) {}

  schedule(job: PartnerListingModerationJob | null) {
    if (!job) return;

    setImmediate(() => {
      void this.execute(job).catch((error) => {
        console.error("Async listing moderation job failed:", error);
      });
    });
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
