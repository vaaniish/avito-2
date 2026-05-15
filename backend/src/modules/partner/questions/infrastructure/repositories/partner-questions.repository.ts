import type { PrismaClient } from "@prisma/client";
import type { PartnerQuestionsRepositoryPort } from "../../domain/partner-questions.types";

export class PartnerQuestionsRepository implements PartnerQuestionsRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  listQuestions(sellerId: number) {
    return this.prisma.listingQuestion.findMany({
      where: {
        listing: {
          seller_id: sellerId,
        },
      },
      include: {
        listing: {
          select: {
            public_id: true,
            title: true,
          },
        },
        buyer: {
          select: {
            public_id: true,
            name: true,
          },
        },
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
    });
  }

  findQuestionForAnswer(params: { sellerId: number; publicId: string }) {
    return this.prisma.listingQuestion.findFirst({
      where: {
        public_id: params.publicId,
        listing: {
          seller_id: params.sellerId,
        },
      },
      select: {
        id: true,
        public_id: true,
        buyer_id: true,
        listing: {
          select: {
            id: true,
            public_id: true,
            seller_id: true,
            title: true,
          },
        },
      },
    });
  }

  answerQuestion(params: { questionId: number; answer: string }) {
    return this.prisma.listingQuestion.update({
      where: { id: params.questionId },
      data: {
        answer: params.answer,
        status: "ANSWERED",
        answered_at: new Date(),
      },
      select: {
        public_id: true,
        answer: true,
        answered_at: true,
        status: true,
      },
    });
  }
}
