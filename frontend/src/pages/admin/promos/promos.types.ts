export type AdminPromoStatus =
  | "scheduled"
  | "active"
  | "paused"
  | "exhausted"
  | "expired";

export type AdminPromoDiscountType = "percent" | "fixed_amount";

export type AdminPromoScopeSummary = {
  label: string;
  categoryCount: number;
  subcategoryCount: number;
  itemCount: number;
  listingCount: number;
};

export type AdminPromoScopeDetailNode = {
  id: string;
  name: string;
  categoryId?: string;
  categoryName?: string;
  subcategoryId?: string;
  subcategoryName?: string;
};

export type AdminPromoSummary = {
  id: string;
  code: string;
  discountType: AdminPromoDiscountType;
  discountValue: number;
  minSubtotal: number;
  maxActivations: number;
  perUserLimit: number;
  usedActivations: number;
  remainingActivations: number;
  startsAt: string;
  endsAt: string;
  isEnabled: boolean;
  isSystem: boolean;
  legacyRule: string | null;
  allCatalog: boolean;
  status: AdminPromoStatus;
  scopeSummary: AdminPromoScopeSummary;
  hasLegacyListingScope: boolean;
  canEditCode: boolean;
  readOnly: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AdminPromoDetail = AdminPromoSummary & {
  scope: {
    allCatalog: boolean;
    categoryIds: string[];
    subcategoryIds: string[];
    itemIds: string[];
  };
  scopeDetails: {
    categories: AdminPromoScopeDetailNode[];
    subcategories: AdminPromoScopeDetailNode[];
    items: AdminPromoScopeDetailNode[];
  };
};

export type AdminPromoFormPayload = {
  code: string;
  discountType: AdminPromoDiscountType;
  discountValue: number;
  minSubtotal: number;
  maxActivations: number;
  perUserLimit: 1;
  startsAt: string;
  endsAt: string;
  isEnabled: boolean;
  allCatalog: boolean;
  categoryIds: string[];
  subcategoryIds: string[];
  itemIds: string[];
};
