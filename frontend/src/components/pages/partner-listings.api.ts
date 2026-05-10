import { apiDelete, apiGet, apiPatch, apiPost } from "../../lib/api";
import type {
  CatalogCategoryDto,
  CatalogReferenceDto,
  CatalogRequestMode,
  CategoryGuessDto,
  CreateSuggestionsDto,
  FormState,
  Listing,
  ListingDraftDto,
  ListingType,
  ProfileAddressDto,
} from "./partner-listings.types";
import type { Address } from "./profile.models";

export function fetchPartnerListings(type: ListingType): Promise<Listing[]> {
  return apiGet<Listing[]>(`/partner/listings?type=${type}`);
}

export function fetchListingDrafts(type: ListingType): Promise<ListingDraftDto[]> {
  return apiGet<ListingDraftDto[]>(`/partner/listing-drafts?type=${type}`);
}

export function createListingDraft(payload: {
  type: ListingType;
  title: string;
  currentScreen: string;
  payload: FormState;
}): Promise<ListingDraftDto> {
  return apiPost<ListingDraftDto>("/partner/listing-drafts", payload);
}

export function updateListingDraft(
  draftId: string,
  payload: {
    type: ListingType;
    title: string;
    currentScreen: string;
    payload: FormState;
  },
): Promise<ListingDraftDto> {
  return apiPatch<ListingDraftDto>(`/partner/listing-drafts/${draftId}`, payload);
}

export function fetchCatalogCategories(type: ListingType): Promise<CatalogCategoryDto[]> {
  return apiGet<CatalogCategoryDto[]>(`/catalog/categories?type=${type}`);
}

export function fetchProfileAddresses(): Promise<ProfileAddressDto[]> {
  return apiGet<ProfileAddressDto[]>("/profile/addresses");
}

export function fetchCreateSuggestions(params: {
  query: string;
  type: ListingType;
}): Promise<CreateSuggestionsDto> {
  return apiGet<CreateSuggestionsDto>(
    `/partner/listings/create-suggestions?q=${encodeURIComponent(params.query)}&type=${encodeURIComponent(params.type)}`,
  );
}

export function guessCategoryByTitle(params: {
  title: string;
  type: ListingType;
}): Promise<CategoryGuessDto> {
  return apiGet<CategoryGuessDto>(
    `/partner/listings/category-guess?title=${encodeURIComponent(params.title)}&type=${encodeURIComponent(params.type)}`,
  );
}

export function fetchCatalogReference(params: {
  item: string;
  brand?: string;
  model?: string;
}): Promise<CatalogReferenceDto> {
  const search = new URLSearchParams({ item: params.item });
  if (params.brand) search.set("brand", params.brand);
  if (params.model) search.set("model", params.model);
  return apiGet<CatalogReferenceDto>(`/partner/listings/catalog-reference?${search.toString()}`);
}

export function createProfileAddress(payload: Record<string, unknown>): Promise<Address> {
  return apiPost<Address>("/profile/addresses", payload);
}

export function createPartnerListing(payload: Record<string, unknown>): Promise<Listing> {
  return apiPost<Listing>("/partner/listings", payload);
}

export function updatePartnerListing(
  listingId: string,
  payload: Record<string, unknown>,
): Promise<Listing> {
  return apiPatch<Listing>(`/partner/listings/${listingId}`, payload);
}

export function deletePartnerListing(listingId: string): Promise<{ success: boolean }> {
  return apiDelete<{ success: boolean }>(`/partner/listings/${listingId}`);
}

export function togglePartnerListingStatus(listingId: string): Promise<{ success: boolean }> {
  return apiPost<{ success: boolean }>(`/partner/listings/${listingId}/toggle-status`);
}

export function createCatalogRequest(payload: {
  mode: CatalogRequestMode;
  categoryName: string;
  subcategoryName: string;
  itemName: string;
  brand: string;
  model: string;
  importantAttributes: string;
  comment: string;
  link: string;
  email: string;
  photoName: string;
  photoLabel: string;
  title: string;
}): Promise<unknown> {
  return apiPost("/partner/listings/catalog-requests", payload);
}
