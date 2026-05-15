import { mapPartnerQuestion } from "../../domain/partner-questions.helpers";
import type { PartnerQuestionsRepositoryPort } from "../../domain/partner-questions.types";

export class ListPartnerQuestionsService {
  constructor(private readonly repository: PartnerQuestionsRepositoryPort) {}

  async execute(sellerId: number) {
    const questions = await this.repository.listQuestions(sellerId);
    return questions.map(mapPartnerQuestion);
  }
}
