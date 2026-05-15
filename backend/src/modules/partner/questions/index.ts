import { prisma } from "../../../lib/prisma";
import { requireAnyRole } from "../../../lib/session";
import { AnswerPartnerQuestionService } from "./application/services/answer-partner-question.service";
import { ListPartnerQuestionsService } from "./application/services/list-partner-questions.service";
import { createPartnerQuestionsRouter } from "./http/partner-questions.router";
import { PartnerQuestionsCircumventionGateway } from "./infrastructure/gateways/partner-questions-circumvention.gateway";
import { PartnerQuestionsNotificationGateway } from "./infrastructure/gateways/partner-questions-notification.gateway";
import { PartnerQuestionsRepository } from "./infrastructure/repositories/partner-questions.repository";

const repository = new PartnerQuestionsRepository(prisma);

export const partnerQuestionsRouter = createPartnerQuestionsRouter({
  requireAnyRole,
  services: {
    listPartnerQuestions: new ListPartnerQuestionsService(repository),
    answerPartnerQuestion: new AnswerPartnerQuestionService(
      repository,
      new PartnerQuestionsNotificationGateway(),
      new PartnerQuestionsCircumventionGateway(),
    ),
  },
});
