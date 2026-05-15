export interface PartnerListingsReadRepositoryPort {
  listListings(params: { sellerId: number; type?: unknown }): Promise<unknown>;
}

export interface PartnerListingsSearchRepositoryPort {
  getTitleSuggestions(params: { query: string; type?: unknown }): Promise<unknown>;
  getCreateSuggestions(params: { query: string; type?: unknown }): Promise<unknown>;
  guessCategory(params: { title: string; type?: unknown }): Promise<unknown>;
}

export interface PartnerListingsCatalogRepositoryPort {
  createCatalogRequest(params: {
    sellerId: number;
    body: Record<string, unknown>;
  }): Promise<unknown>;
  getCatalogReference(params: {
    itemName: string;
    brand: string;
    model: string;
  }): Promise<unknown>;
}

export interface PartnerListingModerationJob {
  listingId: number;
  listingPublicId: string;
  sellerId: number;
  title: string;
  description: string;
  category: string;
  price: number;
  imageUrl?: string | null;
  imageModerationSignals: string[];
}

export interface PartnerListingSellerModerationContext {
  joinedAt: Date;
  isVerified: boolean;
  complaintsCount: number;
  sellerOrdersCount: number;
  listingsCount: number;
}

export interface PartnerListingWriteOperationResult<T> {
  response: T;
  moderationJob: PartnerListingModerationJob | null;
}

export interface PartnerListingsWriteRepositoryPort {
  createListing(params: {
    sellerId: number;
    sellerRole: string;
    body: Record<string, unknown>;
  }): Promise<
    PartnerListingWriteOperationResult<{
      id: string;
      title: string;
      [key: string]: unknown;
    }>
  >;
  updateListing(params: {
    sellerId: number;
    sellerRole: string;
    publicId: string;
    body: Record<string, unknown>;
  }): Promise<PartnerListingWriteOperationResult<unknown>>;
  toggleListingStatus(params: {
    sellerId: number;
    publicId: string;
  }): Promise<PartnerListingWriteOperationResult<unknown>>;
  setListingStatus(params: {
    sellerId: number;
    publicId: string;
    status: unknown;
  }): Promise<PartnerListingWriteOperationResult<unknown>>;
  deleteListing(params: { sellerId: number; publicId: string }): Promise<unknown>;
  loadSellerModerationContext(params: {
    sellerId: number;
  }): Promise<PartnerListingSellerModerationContext | null>;
  applyAutoModerationDecision(params: {
    listingId: number;
    moderationStatus: "APPROVED" | "REJECTED" | "PENDING";
    listingStatus: string;
    reasonCode: string;
    reasonNote?: string | null;
    riskScore: number;
    signals: string[];
    aiUsed: boolean;
    imageModerationSignals: string[];
  }): Promise<{ applied: boolean }>;
}

export interface PartnerListingsNotificationPort {
  notifyAdminsAboutQueuedListing(params: {
    listingPublicId: string;
    title: string;
  }): Promise<void>;
  notifySellerAboutModerationDecision(params: {
    sellerId: number;
    listingPublicId: string;
    title: string;
    moderationStatus: "APPROVED" | "REJECTED" | "PENDING";
    reasonNote?: string | null;
    reasonCode?: string | null;
  }): Promise<void>;
  notifyAdminsAboutManualModeration(params: {
    title: string;
  }): Promise<void>;
}
