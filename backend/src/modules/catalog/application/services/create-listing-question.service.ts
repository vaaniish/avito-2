import { detectCircumventionSignals } from "../../../moderation/anti-circumvention";
import {
  forbidden,
  notFound,
  validationError,
} from "../../../../common/application-error";
import type {
  CatalogCircumventionPort,
  CatalogNotificationPort,
  CatalogRepositoryPort,
} from "../catalog.types";

export class CreateListingQuestionService {
  constructor(
    private readonly repository: CatalogRepositoryPort,
    private readonly notificationWriter: CatalogNotificationPort,
    private readonly circumventionGateway: CatalogCircumventionPort,
  ) {}

  async execute(input: {
    publicId: string;
    actorUserId: number;
    actorRole: string;
    requestIp: string | null;
    question: string;
  }) {
    const questionText = typeof input.question === "string" ? input.question.trim() : "";

    if (questionText.length < 3) {
      throw validationError("Question is too short");
    }

    const listing = await this.repository.findListingQuestionContext(input.publicId);
    if (!listing) {
      throw notFound("Listing not found");
    }

    if (listing.status !== "ACTIVE" || listing.moderation_status !== "APPROVED") {
      throw validationError("По этому объявлению нельзя задать вопрос.");
    }

    if (listing.seller_id === input.actorUserId) {
      throw validationError("Нельзя задавать вопрос по собственному объявлению.");
    }

    const circumventionSignals = detectCircumventionSignals(questionText);
    if (circumventionSignals.length > 0) {
      const enforcement = await this.circumventionGateway.enforceQuestionViolation({
        actorUserId: input.actorUserId,
        actorRole: input.actorRole,
        listingPublicId: listing.public_id,
        text: questionText,
        signals: circumventionSignals,
        requestIp: input.requestIp,
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
        "Запрещено передавать контакты и уводить общение вне платформы в вопросах к товару. Нарушение зафиксировано.",
      );
    }

    const created = await this.repository.createListingQuestion({
      listingId: listing.id,
      buyerId: input.actorUserId,
      question: questionText,
    });

    await this.notificationWriter.notifySellerAboutQuestion({
      sellerId: listing.seller_id,
      listingTitle: listing.title,
    });

    return {
      id: created.public_id,
      user: created.buyer.name,
      date: created.created_at,
      question: created.question,
      answer: created.answer,
      answerDate: created.answered_at,
      helpful: 0,
    };
  }
}
