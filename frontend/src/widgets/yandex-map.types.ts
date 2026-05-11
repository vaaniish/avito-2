import type { MutableRefObject } from "react";

declare global {
  interface Window {
    ymaps: {
      ready: (cb: () => void) => void;
      Map: new (
        container: HTMLElement,
        options: Record<string, unknown>,
        mapOptions?: Record<string, unknown>,
      ) => any;
      Placemark: new (
        coords: number[],
        properties: Record<string, unknown>,
        options: Record<string, unknown>,
      ) => any;
      Clusterer: new (options?: Record<string, unknown>) => any;
      geocode: (query: string | number[], options?: Record<string, unknown>) => Promise<any>;
      suggest?: (
        query: string,
        options?: Record<string, unknown>,
      ) => Promise<Array<{ value?: string; displayName?: string }>>;
    };
  }
}

export interface AddressPayload {
  region: string;
  city: string;
  street: string;
  building: string;
  postalCode: string;
  fullAddress?: string;
  lat?: number | null;
  lon?: number | null;
  country?: string;
}

export type YandexMapMarker = {
  id: string;
  title: string;
  subtitle?: string;
  provider?: string;
  lat: number;
  lng: number;
};

export interface YandexMapPickerProps {
  onAddressSelect: (address: AddressPayload) => void;
  markers?: YandexMapMarker[];
  selectedMarkerId?: string | null;
  onMarkerSelect?: (marker: YandexMapMarker) => void;
  height?: number | string;
  centerQuery?: string | null;
  allowAddressSelect?: boolean;
  onViewportChange?: (payload: { zoom: number }) => void;
}

export type MapStatus = "loading" | "ready" | "unavailable";

export type YandexMapPickerRuntime = {
  mapRef: MutableRefObject<HTMLDivElement | null>;
  mapStatus: MapStatus;
};
