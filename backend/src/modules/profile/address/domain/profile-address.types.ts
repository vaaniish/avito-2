export type ProfileAddressDto = {
  id: string;
  name: string;
  label: string;
  fullAddress: string;
  region: string;
  city: string;
  street: string;
  house: string;
  apartment: string;
  entrance: string;
  building: string;
  postalCode: string;
  lat: number | null;
  lon: number | null;
  isDefault: boolean;
};

export type LegacyBuildingParts = {
  house: string;
  apartment: string;
  entrance: string;
};

export type DeliveryProviderFilter = "all" | "russian_post" | "yandex_pvz";

export type LocationSuggestion = unknown;

export type DeliveryPointPayload = Record<string, unknown>;

export type DeliveryPaginationPayload = {
  total: number;
  cursor: number;
  nextCursor: number | null;
  hasMore: boolean;
};

export type DeliveryLocationPayload = {
  city: string;
  label: string;
  lat: number;
  lng: number;
};

export type ProfileAddressRecord = {
  id: number;
  label: string;
  full_address: string;
  region: string;
  city: string;
  street: string;
  house: string;
  apartment: string | null;
  entrance: string | null;
  postal_code: string;
  lat: number | null;
  lon: number | null;
  is_default: boolean;
};

export type SaveProfileAddressInput = {
  label: string;
  fullAddress: string;
  region: string;
  city: string;
  street: string;
  house: string;
  apartment: string;
  entrance: string;
  postalCode: string;
  lat: number;
  lon: number;
};

export interface ProfileAddressRepositoryPort {
  listByUserId(userId: number): Promise<ProfileAddressRecord[]>;
  countByUserId(userId: number): Promise<number>;
  findByIdForUser(params: {
    id: number;
    userId: number;
  }): Promise<ProfileAddressRecord | null>;
  createForUser(params: {
    userId: number;
    data: SaveProfileAddressInput;
    isDefault: boolean;
  }): Promise<ProfileAddressRecord>;
  updateForUser(params: {
    id: number;
    userId: number;
    data: Partial<SaveProfileAddressInput> & {
      label?: string;
      fullAddress?: string;
      region?: string;
      city?: string;
      street?: string;
      house?: string;
      apartment?: string;
      entrance?: string;
      postalCode?: string;
      lat?: number;
      lon?: number;
    };
    isDefault?: boolean;
  }): Promise<ProfileAddressRecord>;
  deleteForUser(params: { id: number; userId: number }): Promise<void>;
  setDefaultForUser(params: { id: number; userId: number }): Promise<void>;
}

export interface ProfileAddressLocationGatewayPort {
  loadSuggestions(
    query: string,
    limit: number,
  ): Promise<LocationSuggestion[]>;
}

export interface ProfileAddressDeliveryGatewayPort {
  getDeliveryPoints(
    query: string,
    providerFilter: DeliveryProviderFilter,
    options?: { cursor?: number; limit?: number },
  ): Promise<{
    location: DeliveryLocationPayload;
    points: DeliveryPointPayload[];
    pagination?: DeliveryPaginationPayload;
  }>;
}
