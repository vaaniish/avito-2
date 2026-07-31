import { logger } from "../../lib/logger";
import { prisma } from "../../lib/prisma";
import { getSessionUser, requireRole } from "../../lib/session";
import {
  AdminRecomputeRecommendationsService,
  ExplainRecommendationsService,
} from "./application/services/admin-recommendations.service";
import { GetCatalogRecommendationScoresService } from "./application/services/get-catalog-recommendation-scores.service";
import { GetCartRecommendationsService } from "./application/services/get-cart-recommendations.service";
import { GetHomeRecommendationsService } from "./application/services/get-home-recommendations.service";
import { GetSimilarRecommendationsService } from "./application/services/get-similar-recommendations.service";
import { RecordRecommendationEventService } from "./application/services/record-recommendation-event.service";
import {
  REFRESH_JOB_BATCH_SIZE,
  REFRESH_POLL_INTERVAL_MS,
} from "./domain/recommendations.helpers";
import { createAdminRecommendationsRouter } from "./http/admin-recommendations.router";
import { createRecommendationsRouter } from "./http/recommendations.router";
import { RecommendationsRepository } from "./infrastructure/repositories/recommendations.repository";

const repository = new RecommendationsRepository(prisma);

export const recommendationServices = {
  recordEvent: new RecordRecommendationEventService(repository),
  getCatalogRecommendationScores: new GetCatalogRecommendationScoresService(repository),
  getHomeRecommendations: new GetHomeRecommendationsService(repository),
  getSimilarRecommendations: new GetSimilarRecommendationsService(repository),
  getCartRecommendations: new GetCartRecommendationsService(repository),
  recompute: new AdminRecomputeRecommendationsService(repository),
  explain: new ExplainRecommendationsService(repository),
};

export const recommendationsRouter = createRecommendationsRouter({
  getSessionUser,
  services: {
    getHomeRecommendations: recommendationServices.getHomeRecommendations,
    getSimilarRecommendations: recommendationServices.getSimilarRecommendations,
    getCartRecommendations: recommendationServices.getCartRecommendations,
    recordRecommendationEvent: recommendationServices.recordEvent,
  },
});

export const adminRecommendationsRouter = createAdminRecommendationsRouter({
  requireRole,
  roleAdmin: "ADMIN",
  services: {
    recompute: recommendationServices.recompute,
    explain: recommendationServices.explain,
  },
});

let refreshTimer: NodeJS.Timeout | null = null;
let refreshInFlight = false;

async function processRefreshQueueTick() {
  if (refreshInFlight) return;
  refreshInFlight = true;
  try {
    const jobs = await repository.claimRefreshJobs(REFRESH_JOB_BATCH_SIZE);
    for (const job of jobs) {
      try {
        await repository.processRefreshJob(job);
        await repository.completeRefreshJob(job.id);
      } catch (error) {
        logger.error("recommendation_refresh_job_failed", { details: [job, error] });
        await repository.retryRefreshJob(job.id, job.attempts + 1);
      }
    }
  } finally {
    refreshInFlight = false;
  }
}

export function startRecommendationsWorker() {
  if (refreshTimer) return;
  refreshTimer = setInterval(() => {
    void processRefreshQueueTick();
  }, REFRESH_POLL_INTERVAL_MS);
  void processRefreshQueueTick();
}

export async function stopRecommendationsWorker(): Promise<void> {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  while (refreshInFlight) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
