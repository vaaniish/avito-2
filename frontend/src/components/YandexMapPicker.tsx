import React, { useEffect, useMemo, useRef, useState } from "react";
import { MapPin, Search } from "lucide-react";

declare global {
  interface Window {
    ymaps: {
      ready: (cb: () => void) => void;
      Map: new (
        container: HTMLElement,
        options: Record<string, unknown>,
      ) => {
        events: {
          add: (name: string, callback: (event: { get: (key: string) => number[] }) => void) => void;
        };
        setCenter: (coords: number[], zoom: number) => void;
        geoObjects: {
          add: (item: unknown) => void;
          remove: (item: unknown) => void;
        };
        destroy: () => void;
      };
      Placemark: new (
        coords: number[],
        properties: Record<string, unknown>,
        options: Record<string, unknown>,
      ) => {
        events: {
          add: (name: string, callback: () => void) => void;
        };
      };
      geocode: (query: string | number[]) => Promise<{
        geoObjects: {
          get: (index: number) => {
            geometry: {
              getCoordinates: () => number[];
            };
            properties: {
              get: (key: string) => unknown;
            };
          } | undefined;
        };
      }>;
    };
  }
}

interface AddressPayload {
  city: string;
  street: string;
  building: string;
  postalCode: string;
}

export type YandexMapMarker = {
  id: string;
  title: string;
  subtitle?: string;
  provider?: string;
  lat: number;
  lng: number;
};

interface YandexMapPickerProps {
  onAddressSelect: (address: AddressPayload) => void;
  markers?: YandexMapMarker[];
  selectedMarkerId?: string | null;
  onMarkerSelect?: (marker: YandexMapMarker) => void;
}

type MapStatus = "loading" | "ready" | "unavailable";

const YANDEX_MAPS_KEY =
  import.meta.env.VITE_YANDEX_MAPS_API_KEY?.toString().trim() ?? "";

function parseAddressInput(rawValue: string): AddressPayload {
  const normalized = rawValue.trim();
  if (!normalized) {
    return {
      city: "",
      street: "",
      building: "",
      postalCode: "",
    };
  }

  const parts = normalized
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    city: parts[0] ?? normalized,
    street: parts[1] ?? "",
    building: parts[2] ?? "",
    postalCode: "",
  };
}

function markerPreset(provider?: string, selected = false): string {
  if (selected) return "islands#nightIcon";
  if (provider === "cdek") return "islands#darkBlueIcon";
  if (provider === "russian_post") return "islands#orangeIcon";
  if (provider === "ozon") return "islands#violetIcon";
  return "islands#blueIcon";
}

export function YandexMapPicker({
  onAddressSelect,
  markers = [],
  selectedMarkerId = null,
  onMarkerSelect,
}: YandexMapPickerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const selectedPlacemarkRef = useRef<any>(null);
  const markerPlacemarksRef = useRef<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [mapStatus, setMapStatus] = useState<MapStatus>("loading");

  const hasMarkers = markers.length > 0;
  const selectedMarker = useMemo(
    () => markers.find((marker) => marker.id === selectedMarkerId) ?? null,
    [markers, selectedMarkerId],
  );

  useEffect(() => {
    if (!YANDEX_MAPS_KEY) {
      setMapStatus("unavailable");
      return undefined;
    }

    const initMap = () => {
      window.ymaps.ready(() => {
        if (!mapRef.current) return;

        const map = new window.ymaps.Map(mapRef.current, {
          center: [55.751574, 37.573856],
          zoom: 10,
          controls: ["zoomControl"],
        });

        map.events.add("click", (event) => {
          const coords = event.get("coords");
          void getAddressByCoords(coords);
        });

        mapInstanceRef.current = map;
        setMapStatus("ready");
      });
    };

    const existingScript = document.getElementById("yandex-maps-script");
    if (existingScript && window.ymaps) {
      initMap();
    } else if (!existingScript) {
      const script = document.createElement("script");
      script.id = "yandex-maps-script";
      script.src = `https://api-maps.yandex.ru/2.1/?apikey=${YANDEX_MAPS_KEY}&lang=ru_RU`;
      script.async = true;
      script.onload = () => {
        initMap();
      };
      script.onerror = () => {
        setMapStatus("unavailable");
      };
      document.body.appendChild(script);
    } else {
      setMapStatus("unavailable");
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.destroy();
      }
    };
  }, []);

  useEffect(() => {
    if (!window.ymaps || mapStatus !== "ready" || !mapInstanceRef.current) return;

    for (const existing of markerPlacemarksRef.current) {
      mapInstanceRef.current.geoObjects.remove(existing);
    }
    markerPlacemarksRef.current = [];

    for (const marker of markers) {
      const placemark = new window.ymaps.Placemark(
        [marker.lat, marker.lng],
        {
          balloonContent: `<strong>${marker.title}</strong><br/>${marker.subtitle ?? ""}`,
        },
        {
          preset: markerPreset(marker.provider, marker.id === selectedMarkerId),
        },
      );
      placemark.events.add("click", () => {
        onMarkerSelect?.(marker);
      });
      mapInstanceRef.current.geoObjects.add(placemark);
      markerPlacemarksRef.current.push(placemark);
    }
  }, [mapStatus, markers, onMarkerSelect, selectedMarkerId]);

  useEffect(() => {
    if (!selectedMarker || !mapInstanceRef.current || mapStatus !== "ready") return;
    mapInstanceRef.current.setCenter([selectedMarker.lat, selectedMarker.lng], 14);
  }, [mapStatus, selectedMarker]);

  const getAddressByCoords = async (coords: number[]) => {
    if (!window.ymaps || !mapInstanceRef.current) return;

    const geocode = await window.ymaps.geocode(coords);
    const firstGeoObject = geocode.geoObjects.get(0);
    if (!firstGeoObject) return;

    const addressComponents = firstGeoObject.properties.get(
      "metaDataProperty.GeocoderMetaData.Address.Components",
    ) as Array<{ kind: string; name: string }> | undefined;

    let city = "";
    let street = "";
    let building = "";
    let postalCode = "";

    for (const component of addressComponents ?? []) {
      if (component.kind === "locality") city = component.name;
      if (component.kind === "street") street = component.name;
      if (component.kind === "house") building = component.name;
      if (component.kind === "postal_code") postalCode = component.name;
      if (!city && (component.kind === "province" || component.kind === "area")) {
        city = component.name;
      }
    }

    if (selectedPlacemarkRef.current) {
      mapInstanceRef.current.geoObjects.remove(selectedPlacemarkRef.current);
    }

    const placemark = new window.ymaps.Placemark(
      coords,
      {
        balloonContent: String(firstGeoObject.properties.get("text") ?? ""),
      },
      {
        preset: "islands#redDotIcon",
      },
    );

    mapInstanceRef.current.geoObjects.add(placemark);
    selectedPlacemarkRef.current = placemark;

    onAddressSelect({
      city,
      street,
      building,
      postalCode,
    });
  };

  const handleSearch = async () => {
    const query = searchQuery.trim();
    if (!query) return;

    if (mapStatus !== "ready" || !window.ymaps || !mapInstanceRef.current) {
      onAddressSelect(parseAddressInput(query));
      return;
    }

    const geocode = await window.ymaps.geocode(query);
    const firstGeoObject = geocode.geoObjects.get(0);
    if (!firstGeoObject) return;

    const coords = firstGeoObject.geometry.getCoordinates();
    mapInstanceRef.current.setCenter(coords, 15);
    await getAddressByCoords(coords);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="mb-4">
        <label className="block text-sm text-gray-600 mb-2 uppercase tracking-wide">
          Поиск адреса
        </label>
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void handleSearch();
              }
            }}
            className="w-full px-4 py-2.5 pr-10 bg-white border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-gray-900 transition-colors duration-300"
            placeholder="Введите адрес..."
          />
          <button
            onClick={() => {
              void handleSearch();
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <Search className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          {mapStatus === "ready"
            ? hasMarkers
              ? "На карте отображены доступные ПВЗ. Можно выбрать точку или указать адрес вручную."
              : "Нажмите на карту или введите адрес для поиска."
            : "Введите адрес вручную в формате: город, улица, дом"}
        </p>
      </div>

      <div
        ref={mapRef}
        className="flex-1 rounded-xl overflow-hidden bg-gray-100 min-h-[400px] relative"
      >
        {mapStatus === "loading" && (
          <div className="w-full h-full flex items-center justify-center">
            <p className="text-gray-500">Загрузка карты...</p>
          </div>
        )}

        {mapStatus === "unavailable" && (
          <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-gradient-to-br from-gray-100 to-gray-200">
            <MapPin className="w-16 h-16 text-gray-400 mb-4" />
            <h4 className="text-lg text-gray-700 mb-2">Карта недоступна</h4>
            <p className="text-sm text-gray-600 max-w-md">
              Добавьте `VITE_YANDEX_MAPS_API_KEY` в окружение фронтенда, чтобы
              включить выбор адреса и ПВЗ на карте.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
