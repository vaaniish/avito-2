import { enforceCircumventionViolation } from "../../../../moderation/circumvention-enforcement";
import type { PartnerQuestionsCircumventionPort } from "../../domain/partner-questions.types";

export class PartnerQuestionsCircumventionGateway
  implements PartnerQuestionsCircumventionPort
{
  enforce(params: {
    actorUserId: number;
    actorRole: string;
    requestIp: string | null;
    answer: string;
    signals: string[];
    listingId: number;
    listingPublicId: string;
    sellerId: number;
    buyerId: number;
    questionPublicId: string;
  }) {
    return enforceCircumventionViolation({
      requestIp: params.requestIp,
      actorUserId: params.actorUserId,
      actorRole: params.actorRole,
      channel: "seller_answer",
      text: params.answer,
      signals: params.signals,
      listingPublicId: params.listingPublicId,
      questionPublicId: params.questionPublicId,
      autoComplaint: {
        listingId: params.listingId,
        listingPublicId: params.listingPublicId,
        sellerId: params.sellerId,
        reporterId: params.buyerId,
        questionPublicId: params.questionPublicId,
      },
    });
  }
}
