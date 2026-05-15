import { enforceCircumventionViolation } from "../../../moderation/circumvention-enforcement";

export class CatalogCircumventionGateway {
  async enforceQuestionViolation(input: {
    actorUserId: number;
    actorRole: string;
    listingPublicId: string;
    text: string;
    signals: string[];
    requestIp: string | null;
  }) {
    return enforceCircumventionViolation({
      actorUserId: input.actorUserId,
      actorRole: input.actorRole,
      channel: "buyer_question",
      text: input.text,
      signals: input.signals,
      listingPublicId: input.listingPublicId,
      requestIp: input.requestIp,
    });
  }
}
