export type CatalogRequestMeta = {
  actorUserId: number;
  actorRole: string;
  requestIp: string | null;
  userAgent?: string | null;
};

export interface CatalogRepositoryPort {
  findCategoriesWithTree(type: "PRODUCT"): Promise<any[]>;
  groupVisibleListingCountsByItem(type: "PRODUCT"): Promise<any[]>;
  resolveCatalogItemId(type: "PRODUCT", publicId: string): Promise<number | null>;
  resolveCatalogItemIds(type: "PRODUCT", publicIds: string[]): Promise<number[]>;
  findActiveApprovedListings(params: {
    where: Record<string, unknown>;
    take?: number;
    skip?: number;
  }): Promise<any[]>;
  findListingCandidates(where: Record<string, unknown>): Promise<any[]>;
  findBranchHintItems(type: "PRODUCT"): Promise<any[]>;
  findDetailedListingsByIds(ids: number[]): Promise<any[]>;
  loadSellerReviewMetrics(sellerIds: number[]): Promise<Map<number, { rating: number; reviewsCount: number }>>;
  loadSellerReviews(sellerId: number, limit?: number): Promise<any[]>;
  findListingDetailsByPublicId(publicId: string): Promise<any | null>;
  findBuyerAccessOrderItem(listingId: number, buyerId: number): Promise<{ id: true } | null>;
  incrementListingViews(publicId: string): Promise<number>;
  findSellerByPublicId(publicId: string): Promise<any | null>;
  findSuggestionListings(): Promise<any[]>;
  findListingQuestionContext(publicId: string): Promise<any | null>;
  findListingQuestions(listingId: number): Promise<any[]>;
  countListingQuestions(listingId: number): Promise<number>;
  findListingQuestionsPage(listingId: number, take: number, skip: number): Promise<any[]>;
  createListingQuestion(params: {
    listingId: number;
    buyerId: number;
    question: string;
  }): Promise<any>;
  findComplaintListing(publicId: string): Promise<any | null>;
  countComplaintsFromReporterSince(reporterId: number, since: Date): Promise<number>;
  findDuplicateComplaint(params: {
    reporterId: number;
    listingId: number;
    complaintType: string;
    since: Date;
  }): Promise<any | null>;
  createComplaintWithEvent(params: {
    publicId: string;
    eventPublicId: string;
    complaintType: string;
    listingId: number;
    sellerId: number;
    reporterId: number;
    description: string;
  }): Promise<any>;
  loadEffectiveSearchRules(): Promise<any[]>;
}

export interface CatalogNotificationPort {
  notifySellerAboutQuestion(params: {
    sellerId: number;
    listingTitle: string;
  }): Promise<void>;
  notifyAdminsAboutComplaint(params: {
    listingTitle: string;
  }): Promise<void>;
  notifySellerAboutComplaint(params: {
    sellerId: number;
    listingTitle: string;
  }): Promise<void>;
}

export interface CatalogCircumventionPort {
  enforceQuestionViolation(input: {
    actorUserId: number;
    actorRole: string;
    listingPublicId: string;
    text: string;
    signals: string[];
    requestIp: string | null;
  }): Promise<{
    blocked: boolean;
    blockedUntil: Date | null;
  }>;
}
