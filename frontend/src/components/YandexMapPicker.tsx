import React, { useEffect, useMemo, useRef, useState } from "react";
import { MapPin } from "lucide-react";

declare global {
  interface Window {
    ymaps: {
      ready: (cb: () => void) => void;
      Map: new (
        container: HTMLElement,
        options: Record<string, unknown>,
        mapOptions?: Record<string, unknown>,
      ) => {
        events: {
          add: (name: string, callback: (event: { get: (key: string) => number[] }) => void) => void;
        };
        behaviors?: {
          disable?: (name: string) => void;
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
      suggest?: (
        query: string,
        options?: Record<string, unknown>,
      ) => Promise<Array<{ value?: string; displayName?: string }>>;
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
  height?: number | string;
  centerQuery?: string | null;
}

type MapStatus = "loading" | "ready" | "unavailable";

const YANDEX_MAPS_KEY =
  import.meta.env.VITE_YANDEX_MAPS_API_KEY?.toString().trim() ?? "";

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
  height = 460,
  centerQuery = null,
}: YandexMapPickerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const selectedPlacemarkRef = useRef<any>(null);
  const markerPlacemarksRef = useRef<any[]>([]);
  const autoGeolocationRequestedRef = useRef(false);
  const [mapStatus, setMapStatus] = useState<MapStatus>("loading");
  const [locationHint, setLocationHint] = useState("");

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
        try {
          if (!mapRef.current) return;

          const map = new window.ymaps.Map(mapRef.current, {
            center: [55.751574, 37.573856],
            zoom: 10,
            controls: ["zoomControl", "geolocationControl"],
          }, {
            suppressMapOpenBlock: true,
          });
          map.behaviors?.disable?.("scrollZoom");

          map.events.add("click", (event) => {
            const coords = event.get("coords");
            void getAddressByCoords(coords);
          });

          mapInstanceRef.current = map;
          setMapStatus("ready");
        } catch (error) {
          console.error("Yandex map init error:", error);
          setMapStatus("unavailable");
        }
      });
    };

    const existingScript = document.getElementById("yandex-maps-script");
    if (existingScript && window.ymaps) {
      initMap();
    } else if (!existingScript) {
      const script = document.createElement("script");
      script.id = "yandex-maps-script";
      script.src = `https://api-maps.yandex.ru/2.1/?apikey=${YANDEX_MAPS_KEY}&lang=ru_RU&load=package.full`;
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
  useEffect(() => {
    const query = centerQuery?.trim();
    if (!query || mapStatus !== "ready" || !mapInstanceRef.current || !window.ymaps?.geocode) return;

    let cancelled = false;
    void window.ymaps
      .geocode(query)
      .then((geocodeResult) => {
        if (cancelled) return;
        const firstGeoObject = geocodeResult?.geoObjects?.get?.(0);
        if (!firstGeoObject) return;
        const coords = firstGeoObject.geometry?.getCoordinates?.();
        if (!Array.isArray(coords) || coords.length < 2) return;
        mapInstanceRef.current.setCenter(coords, 14);
      })
      .catch(() => {
        // noop
      });

    return () => {
      cancelled = true;
    };
  }, [centerQuery, mapStatus]);

  const getAddressByCoords = async (coords: number[], options?: { auto?: boolean }) => {
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

    if (options?.auto && (!city || !street)) {
      setLocationHint(
        "Геопозиция определена неточно. Выберите точку на карте вручную или введите адрес.",
      );
      return;
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
    setLocationHint("");
  };

  const requestCurrentLocation = async () => {
    if (!navigator.geolocation) {
      setLocationHint("Браузер не поддерживает геолокацию.");
      return;
    }

    setLocationHint("");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = [position.coords.latitude, position.coords.longitude];
        if (position.coords.accuracy > 2000) {
          setLocationHint(
            "Геолокация определена слишком приблизительно. Уточните адрес вручную или выберите точку на карте.",
          );
          return;
        }

        if (mapStatus === "ready" && mapInstanceRef.current) {
          mapInstanceRef.current.setCenter(coords, 15);
          void getAddressByCoords(coords, { auto: true });
        }
      },
      () => {
        setLocationHint(
          "Не удалось получить геолокацию. Разрешите доступ к местоположению в браузере.",
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 15_000,
        maximumAge: 0,
      },
    );
  };

  useEffect(() => {
    if (mapStatus !== "ready") return;
    if (typeof window === "undefined") return;
    if (!navigator.geolocation) return;
    if (autoGeolocationRequestedRef.current) return;

    autoGeolocationRequestedRef.current = true;
    void requestCurrentLocation();
  }, [mapStatus]);

  useEffect(() => {
    if (mapStatus !== "ready" || !mapInstanceRef.current) return;
    let frameId = 0;
    const fit = () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      frameId = window.requestAnimationFrame(() => {
        try {
          mapInstanceRef.current?.container?.fitToViewport?.();
        } catch {
          // no-op: prevent ResizeObserver/viewport noise from crashing UI
        }
      });
    };

    const timer1 = window.setTimeout(fit, 80);
    const timer2 = window.setTimeout(fit, 260);
    const timer3 = window.setTimeout(fit, 700);
    window.addEventListener("resize", fit, { passive: true });

    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      window.clearTimeout(timer1);
      window.clearTimeout(timer2);
      window.clearTimeout(timer3);
      window.removeEventListener("resize", fit);
    };
  }, [mapStatus, height]);

  return (
    <div className="w-full">
      <div
        ref={mapRef}
        className="w-full rounded-xl overflow-hidden bg-gray-100 relative"
        style={{
          height:
            typeof height === "number"
              ? `${Math.max(320, height)}px`
              : (height || "460px"),
        }}
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

