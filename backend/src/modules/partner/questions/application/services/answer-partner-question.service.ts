import {
  forbidden,
  notFound,
  validationError,
} from "../../../../../common/application-error";
import { detectCircumventionSignals } from "../../../../moderation/anti-circumvention";
import { toQuestionStatus } from "../../../../../utils/format";
import type {
  PartnerQuestionsCircumventionPort,
  PartnerQuestionsNotificationPort,
  PartnerQuestionsRepositoryPort,
} from "../../domain/partner-questions.types";

export class AnswerPartnerQuestionService {
  constructor(
    private readonly repository: PartnerQuestionsRepositoryPort,
    private readonly notificationPort: PartnerQuestionsNotificationPort,
    private readonly circumventionPort: PartnerQuestionsCircumventionPort,
  ) {}

  async execute(input: {
    sellerId: number;
    sellerRole: string;
    requestIp: string | null;
    publicId: string;
    answer: unknown;
  }) {
    const answer =
      typeof input.answer === "string" ? input.answer.trim() : "";
    if (!answer) {
      throw validationError("Answer must not be empty");
    }

    const existing = await this.repository.findQuestionForAnswer({
      sellerId: input.sellerId,
      publicId: input.publicId,
    });
    if (!existing) {
      throw notFound("Question not found");
    }

    const signals = detectCircumventionSignals(answer);
    if (signals.length > 0) {
      const enforcement = await this.circumventionPort.enforce({
        actorUserId: input.sellerId,
        actorRole: input.sellerRole,
        requestIp: input.requestIp,
        answer,
        signals,
        listingId: existing.listing.id,
        listingPublicId: existing.listing.public_id,
        sellerId: existing.listing.seller_id,
        buyerId: existing.buyer_id,
        questionPublicId: existing.public_id,
      });

      if (enforcement.blocked) {
        const blockedUntil = enforcement.blockedUntil
          ? ` до ${enforcement.blockedUntil.toISOString()}`
          : "";
        throw forbidden(
          `Аккаунт временно заблокирован${blockedUntil} за повторные попытки обхода платформы.`,
        );
      }

      throw validationError(
        "Ответ отклонен: запрещено передавать контакты и уводить сделку вне платформы. Нарушение зафиксировано.",
        { complaintId: enforcement.complaintPublicId },
      );
    }

    const updated = await this.repository.answerQuestion({
      questionId: existing.id,
      answer,
    });

    await this.notificationPort.notifyBuyerAboutAnswer({
      buyerId: existing.buyer_id,
      listingPublicId: existing.listing.public_id,
      listingTitle: existing.listing.title,
    });

    return {
      success: true,
      id: updated.public_id,
      answer: updated.answer,
      answeredAt: updated.answered_at,
      status: toQuestionStatus(updated.status),
    };
  }
}
