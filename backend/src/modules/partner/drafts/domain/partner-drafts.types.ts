export type ListingTypeValue = "PRODUCT";

export type ListingDraftRecord = {
  id: number;
  public_id: string;
  title: string | null;
  type: ListingTypeValue;
  category_id: number | null;
  subcategory_id: number | null;
  item_id: number | null;
  payload: unknown;
  current_screen: string;
  updated_at: Date;
  created_at: Date;
};

export interface PartnerDraftsRepositoryPort {
  listDrafts(params: {
    sellerId: number;
    type: ListingTypeValue;
  }): Promise<ListingDraftRecord[]>;
  createDraft(params: {
    sellerId: number;
    type: ListingTypeValue;
    title: string | null;
    categoryId: number | null;
    subcategoryId: number | null;
    itemId: number | null;
    payload: Record<string, unknown>;
    currentScreen: string;
  }): Promise<ListingDraftRecord>;
  findDraft(params: {
    sellerId: number;
    publicId: string;
  }): Promise<ListingDraftRecord | null>;
  updateDraft(params: {
    draftId: number;
    data: {
      type?: ListingTypeValue;
      title?: string | null;
      categoryId?: number | null;
      subcategoryId?: number | null;
      itemId?: number | null;
      payload?: Record<string, unknown>;
      currentScreen?: string;
    };
  }): Promise<ListingDraftRecord>;
  deleteDraft(draftId: number): Promise<void>;
}
