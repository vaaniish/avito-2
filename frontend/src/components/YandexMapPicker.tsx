import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
        container?: {
          fitToViewport?: () => void;
        };
        controls?: {
          remove?: (name: string) => void;
        };
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
      geocode: (query: string | number[], options?: Record<string, unknown>) => Promise<{
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
const YANDEX_SUGGEST_KEY =
  import.meta.env.VITE_YANDEX_SUGGEST_API_KEY?.toString().trim() ??
  import.meta.env.VITE_YANDEX_GEOSUGGEST_API_KEY?.toString().trim() ??
  "";
const FEDERAL_DISTRICT_RE = /\u0444\u0435\u0434\u0435\u0440\u0430\u043b\u044c\u043d\p{L}*\s+\u043e\u043a\u0440\u0443\u0433/iu;
const MUNICIPAL_FORMATION_RE =
  /\u043c\u0443\u043d\u0438\u0446\u0438\u043f\u0430\u043b\u044c\u043d\p{L}*\s+\u043e\u0431\u0440\u0430\u0437\u043e\u0432\u0430\u043d\p{L}*/iu;
const REGION_LEVEL_RE =
  /(?:\u043e\u0431\u043b\u0430\u0441\u0442\p{L}*|\u043a\u0440\u0430\u0439|\u0440\u0435\u0441\u043f\u0443\u0431\u043b\u0438\u043a\p{L}*|\u0430\u0432\u0442\u043e\u043d\u043e\u043c\p{L}*\s+\u043e\u0431\u043b\u0430\u0441\u0442\p{L}*|\u0430\u0432\u0442\u043e\u043d\u043e\u043c\p{L}*\s+\u043e\u043a\u0440\u0443\u0433)/iu;
const RUSSIAN_COUNTRY_RE = /(?:^|\b)(?:\u0440\u043e\u0441\u0441\u0438\p{L}*|russia|russian\s+federation)(?:$|\b)/iu;

const normalizeAdministrativeLabel = (value: string) => {
  return value
    .toLowerCase()
    .replace(/\u0451/g, "\u0435")
    .replace(/\s+/g, " ")
    .trim();
};

const isFederalDistrict = (value: string) => {
  const normalized = normalizeAdministrativeLabel(value);
  return FEDERAL_DISTRICT_RE.test(value) || (normalized.includes("\u0444\u0435\u0434\u0435\u0440\u0430\u043b") && normalized.includes("\u043e\u043a\u0440\u0443\u0433"));
};

const isMunicipalFormation = (value: string) => {
  const normalized = normalizeAdministrativeLabel(value);
  return MUNICIPAL_FORMATION_RE.test(value) || (normalized.includes("\u043c\u0443\u043d\u0438\u0446\u0438\u043f\u0430\u043b") && normalized.includes("\u043e\u0431\u0440\u0430\u0437\u043e\u0432"));
};

const isBroadAdministrativeUnit = (value: string) => isFederalDistrict(value) || isMunicipalFormation(value);
const isRussianCountry = (value: string | null | undefined) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return true;
  return RUSSIAN_COUNTRY_RE.test(normalized);
};

const sanitizeHouseValue = (value: string | null | undefined) => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  return raw
    .replace(/^\s*(?:дом|д\.?)\s*/iu, "")
    .replace(/\s*,?\s*(?:кв\.?|квартира)\s*[0-9a-zа-я/-]+.*$/iu, "")
    .replace(/\s*,?\s*(?:под[ъь]?езд|под\.?\s*езд)\s*[0-9a-zа-я/-]+.*$/iu, "")
    .trim();
};

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

  const parseGeoObjectAddress = useCallback((
    geoObject: {
      properties: {
        get: (key: string) => unknown;
      };
    },
  ) => {
    const addressComponents = geoObject.properties.get(
      "metaDataProperty.GeocoderMetaData.Address.Components",
    ) as Array<{ kind: string; name: string }> | undefined;

    let province = "";
    let area = "";
    let city = "";
    let street = "";
    let building = "";
    let postalCode = "";
    let country = "";

    for (const component of addressComponents ?? []) {
      if (component.kind === "province" && !province) province = component.name;
      if (component.kind === "area" && !area) area = component.name;
      if (component.kind === "locality" && !isBroadAdministrativeUnit(component.name)) {
        city = component.name;
      }
      if (component.kind === "street") street = component.name;
      if (component.kind === "house") building = sanitizeHouseValue(component.name);
      if (component.kind === "postal_code") postalCode = component.name;
      if (component.kind === "country" && !country) country = component.name;
    }

    const regionCandidates = [province, area]
      .map((item) => String(item ?? "").trim())
      .filter(Boolean)
      .filter((item) => !isBroadAdministrativeUnit(item));
    const region =
      regionCandidates.find((item) => REGION_LEVEL_RE.test(item)) ||
      regionCandidates[0] ||
      "";

    if (!city && region) {
      city = region;
    }

    return {
      region,
      city,
      street,
      building: sanitizeHouseValue(building),
      postalCode,
      fullText: String(geoObject.properties.get("text") ?? ""),
      country: country.trim(),
    };
  }, []);

  const setSelectedPlacemark = useCallback((coords: number[], balloonContent: string) => {
    if (!mapInstanceRef.current || !window.ymaps) return;

    if (selectedPlacemarkRef.current) {
      mapInstanceRef.current.geoObjects.remove(selectedPlacemarkRef.current);
    }

    const placemark = new window.ymaps.Placemark(
      coords,
      { balloonContent },
      { preset: "islands#redIcon" },
    );

    mapInstanceRef.current.geoObjects.add(placemark);
    selectedPlacemarkRef.current = placemark;
  }, []);

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
          map.controls?.remove?.("searchControl");
          map.controls?.remove?.("typeSelector");
          map.controls?.remove?.("trafficControl");
          map.controls?.remove?.("fullscreenControl");
          map.controls?.remove?.("rulerControl");
          map.behaviors?.enable?.("scrollZoom");

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
      const scriptUrl = new URL("https://api-maps.yandex.ru/2.1/");
      scriptUrl.searchParams.set("apikey", YANDEX_MAPS_KEY);
      scriptUrl.searchParams.set("lang", "ru_RU");
      scriptUrl.searchParams.set("load", "package.full");
      if (YANDEX_SUGGEST_KEY) {
        scriptUrl.searchParams.set("suggest_apikey", YANDEX_SUGGEST_KEY);
      }
      script.src = scriptUrl.toString();
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
        const parsed = parseGeoObjectAddress(firstGeoObject);
        setSelectedPlacemark(coords, parsed.fullText);
      })
      .catch(() => {
        // noop
      });

    return () => {
      cancelled = true;
    };
  }, [centerQuery, mapStatus, parseGeoObjectAddress, setSelectedPlacemark]);

  const getAddressByCoords = async (coords: number[], options?: { auto?: boolean }) => {
    if (!window.ymaps || !mapInstanceRef.current) return;

    const geocode = await window.ymaps.geocode(coords);
    const firstGeoObject = geocode.geoObjects.get(0);
    if (!firstGeoObject) return;

    let parsed = parseGeoObjectAddress(firstGeoObject);
    if (!parsed.postalCode) {
      try {
        const reverseGeocode = await window.ymaps.geocode(coords, { kind: "house", results: 1 });
        const reverseFirst = reverseGeocode?.geoObjects?.get?.(0);
        if (reverseFirst) {
          const reverseParsed = parseGeoObjectAddress(reverseFirst);
          parsed = {
            ...parsed,
            region: parsed.region || reverseParsed.region,
            city: parsed.city || reverseParsed.city,
            street: parsed.street || reverseParsed.street,
            building: parsed.building || reverseParsed.building,
            postalCode: parsed.postalCode || reverseParsed.postalCode,
            fullText: parsed.fullText || reverseParsed.fullText,
          };
        }
      } catch {
        // keep parsed from primary geocode
      }
    }

    if (options?.auto && (!parsed.city || !parsed.street)) {
      setLocationHint(
        "Геопозиция определена неточно. Выберите точку на карте вручную или введите адрес.",
      );
      return;
    }

    if (!isRussianCountry(parsed.country)) {
      setLocationHint("Доступны только точки в России.");
      return;
    }

    setSelectedPlacemark(coords, parsed.fullText);

    onAddressSelect({
      region: parsed.region,
      city: parsed.city,
      street: parsed.street,
      building: parsed.building,
      postalCode: parsed.postalCode,
      fullAddress: parsed.fullText,
      lat: Number.isFinite(coords[0]) ? coords[0] : null,
      lon: Number.isFinite(coords[1]) ? coords[1] : null,
      country: parsed.country,
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

  useEffect(() => {
    if (mapStatus !== "ready" || !mapRef.current || !mapInstanceRef.current) return;
    if (typeof ResizeObserver === "undefined") return;

    let frameId = 0;
    const fit = () => {
      try {
        mapInstanceRef.current?.container?.fitToViewport?.();
      } catch {
        // no-op
      }
    };

    const observer = new ResizeObserver(() => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      frameId = window.requestAnimationFrame(fit);
    });
    observer.observe(mapRef.current);

    return () => {
      observer.disconnect();
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [mapStatus]);

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

