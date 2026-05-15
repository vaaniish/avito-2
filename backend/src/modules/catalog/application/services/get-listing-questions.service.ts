import { notFound, validationError } from "../../../../common/application-error";
import type { CatalogRepositoryPort } from "../catalog.types";

function mapQuestion(question: {
  public_id: string;
  created_at: Date;
  question: string;
  answer: string | null;
  answered_at: Date | null;
  buyer: { name: string };
}) {
  return {
    id: question.public_id,
    user: question.buyer.name,
    date: question.created_at,
    question: question.question,
    answer: question.answer,
    answerDate: question.answered_at,
    helpful: 0,
  };
}

export class GetListingQuestionsService {
  constructor(private readonly repository: CatalogRepositoryPort) {}

  async execute(input: {
    publicId: string;
    query: Record<string, unknown>;
  }) {
    const listing = await this.repository.findListingQuestionContext(input.publicId);
    if (!listing) {
      throw notFound("Listing not found");
    }

    const usePagination =
      input.query.paginated === "1" ||
      input.query.limit !== undefined ||
      input.query.offset !== undefined;

    if (!usePagination) {
      const questions = await this.repository.findListingQuestions(listing.id);
      return questions.map(mapQuestion);
    }

    const limitRaw = input.query.limit ? Number(input.query.limit) : 6;
    const offsetRaw = input.query.offset ? Number(input.query.offset) : 0;
    if (!Number.isInteger(limitRaw) || limitRaw <= 0) {
      throw validationError("Invalid limit");
    }
    if (!Number.isInteger(offsetRaw) || offsetRaw < 0) {
      throw validationError("Invalid offset");
    }

    const take = Math.min(limitRaw, 50);
    const skip = offsetRaw;
    const [total, questions] = await Promise.all([
      this.repository.countListingQuestions(listing.id),
      this.repository.findListingQuestionsPage(listing.id, take, skip),
    ]);

    return {
      items: questions.map(mapQuestion),
      pagination: {
        limit: take,
        offset: skip,
        total,
        hasMore: skip + questions.length < total,
      },
    };
  }
}
