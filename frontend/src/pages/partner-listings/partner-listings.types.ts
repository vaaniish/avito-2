import type { Address } from "../profile/profile.models";

export type ListingAttribute = { key: string; value: string };
export type ListingType = "products";
export type CreationScreen = "start" | "titleSearch" | "manualCategory" | "details";
export type ListingCondition = "new" | "restored" | "used";
export type DefectsValue = "" | "yes" | "no";
export type CatalogRequestMode = "catalog" | "characteristic";

export type CharacteristicField = {
  key: string;
  label: string;
  required?: boolean;
  options?: string[];
  inputType?: "text" | "number" | "select" | "textarea";
  unit?: string | null;
  min?: number | null;
  max?: number | null;
  defaultValue?: string | null;
  orderIndex?: number;
  locked?: boolean;
  source?: "bracketGroups" | "titleFallback";
};

export type Listing = {
  id: string;
  title: string;
  price: number;
  condition: ListingCondition;
  status: "active" | "inactive" | "moderation";
  views: number;
  created_at: string;
  image: string;
  images?: string[];
  description?: string | null;
  category?: string;
  city?: string | null;
  attributes?: ListingAttribute[];
  moderation?: {
    status: "approved" | "pending" | "rejected";
    reasonCode?: string | null;
    reasonNote?: string | null;
    decidedAt?: string | null;
  };
};

export type FormState = {
  title: string;
  price: string;
  condition: ListingCondition;
  description: string;
  category: string;
  categoryRoot: string;
  customCategoryRoot: string;
  subcategory: string;
  customSubcategory: string;
  catalogItem: string;
  customCatalogItem: string;
  catalogRequestAttributes: string;
  catalogRequestComment: string;
  type: ListingType;
  meetingAddress: string;
  images: string[];
  hasDefects: DefectsValue;
  characteristics: Record<string, string>;
  hasMultipleStock: boolean;
};

export type CatalogCategoryDto = {
  id: string;
  name: string;
  attributeSchema?: CharacteristicField[];
  subcategories: Array<{
    id: string;
    name: string;
    items: string[];
    attributeSchema?: CharacteristicField[];
    itemAttributeSchemas?: Record<string, CharacteristicField[]>;
  }>;
};

export type ProfileAddressDto = Address;

export type CategoryGuessDto = {
  category: string | null;
  confidence: number;
  source?: "listing" | "catalog";
};

export type CreateSuggestionMatch = {
  itemId: string;
  itemPublicId: string;
  itemName: string;
  subcategoryId: string;
  subcategoryName: string;
  categoryId: string;
  categoryName: string;
  score: number;
};

export type CreateSuggestionsDto = {
  query: string;
  chips: string[];
  titleSuggestions?: string[];
  matches: CreateSuggestionMatch[];
};

export type ListingDraftDto = {
  id: string;
  title: string;
  type: ListingType;
  payload: Partial<FormState> | null;
  currentScreen: CreationScreen | string;
  updatedAt: string;
};

export type CatalogReferenceCharacteristicDto = {
  key: string;
  label: string;
  value: string;
  rawValue: string;
  sourceGroupIndex: number;
  source?: "bracketGroups" | "titleFallback";
};

export type CatalogReferenceVariantDto = {
  productId: string;
  title: string;
  characteristics: CatalogReferenceCharacteristicDto[];
};

export type CatalogReferenceFieldDto = {
  key: string;
  label: string;
  options: string[];
  defaultValue: string | null;
  locked: boolean;
  source: "bracketGroups" | "titleFallback";
  orderIndex: number;
};

export type CatalogReferenceDto = {
  item?: string;
  supported?: boolean;
  brands?: string[];
  brand?: string;
  models?: string[];
  model?: string;
  variants?: CatalogReferenceVariantDto[];
  characteristics?: CatalogReferenceCharacteristicDto[];
  fields?: CatalogReferenceFieldDto[];
};

export type PartnerListingsPageProps = {
  onRequestAddressChange?: () => void;
  onOpenListing?: (listingPublicId: string) => void;
  onOpenCreateListing?: () => void;
  onExitCreate?: () => void;
  createMode?: boolean;
};

export type CatalogRequestModalPayload = {
  category: string;
  subcategory: string;
  item: string;
  brand: string;
  model: string;
  details: string;
  link: string;
  email: string;
  photoName: string;
  photoLabel: string;
};
