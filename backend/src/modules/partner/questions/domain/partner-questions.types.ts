export interface PartnerQuestionsRepositoryPort {
  listQuestions(sellerId: number): Promise<
    Array<{
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
    }>
  >;
  findQuestionForAnswer(params: {
    sellerId: number;
    publicId: string;
  }): Promise<{
    id: number;
    public_id: string;
    buyer_id: number;
    listing: {
      id: number;
      public_id: string;
      seller_id: number;
      title: string;
    };
  } | null>;
  answerQuestion(params: {
    questionId: number;
    answer: string;
  }): Promise<{
    public_id: string;
    answer: string | null;
    answered_at: Date | null;
    status: string;
  }>;
}

export interface PartnerQuestionsNotificationPort {
  notifyBuyerAboutAnswer(params: {
    buyerId: number;
    listingPublicId: string;
    listingTitle: string;
  }): Promise<void>;
}

export interface PartnerQuestionsCircumventionPort {
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
  }): Promise<{
    blocked: boolean;
    blockedUntil: Date | null;
    complaintPublicId: string | null;
  }>;
}
