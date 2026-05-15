import { toQuestionStatus } from "../../../../utils/format";

export function mapPartnerQuestion(question: {
  public_id: string;
  question: string;
  answer: string | null;
  status: string;
  created_at: Date;
  answered_at: Date | null;
  listing: {
    public_id: string;
    title: string;
  };
  buyer: {
    public_id: string;
    name: string;
  };
}) {
  return {
    id: question.public_id,
    listingId: question.listing.public_id,
    listingTitle: question.listing.title,
    buyerName: question.buyer.name,
    buyerId: question.buyer.public_id,
    question: question.question,
    answer: question.answer,
    status: toQuestionStatus(question.status),
    createdAt: question.created_at,
    answeredAt: question.answered_at,
  };
}
