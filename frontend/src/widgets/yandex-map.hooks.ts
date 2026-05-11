import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { YandexMapPickerProps, YandexMapPickerRuntime } from "./yandex-map.types";
import {
  MAX_RENDERED_MARKERS,
  YANDEX_MAPS_KEY,
  YANDEX_SUGGEST_KEY,
  isBroadAdministrativeUnit,
  isRussianCountry,
  markerCaption,
  markerPreset,
  regionFromCandidates,
  sanitizeHouseValue,
} from "./yandex-map.utils";

export function useYandexMapPicker(params: YandexMapPickerProps): YandexMapPickerRuntime {
  const {
    onAddressSelect,
    markers = [],
    selectedMarkerId = null,
    onMarkerSelect,
    centerQuery = null,
    allowAddressSelect = true,
    onViewportChange,
  } = params;

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const clustererRef = useRef<any>(null);
  const markerLayerRef = useRef<any>(null);
  const selectedPlacemarkRef = useRef<any>(null);
  const markerPlacemarksRef = useRef<any[]>([]);
  const autoGeolocationRequestedRef = useRef(false);
  const lastCenteredQueryRef = useRef<string | null>(null);
  const viewportUpdateTimerRef = useRef<number | null>(null);
  const [viewportTick, setViewportTick] = useState(0);
  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "unavailable">("loading");

  const parseGeoObjectAddress = useCallback((geoObject: { properties: { get: (key: string) => unknown } }) => {
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
      if (component.kind === "locality" && !isBroadAdministrativeUnit(component.name)) city = component.name;
      if (component.kind === "street") street = component.name;
      if (component.kind === "house") building = sanitizeHouseValue(component.name);
      if (component.kind === "postal_code") postalCode = component.name;
      if (component.kind === "country" && !country) country = component.name;
    }

    const region = regionFromCandidates(province, area);
    if (!city && region) city = region;

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
    if (!allowAddressSelect || !mapInstanceRef.current || !window.ymaps) return;
    if (selectedPlacemarkRef.current) {
      mapInstanceRef.current.geoObjects.remove(selectedPlacemarkRef.current);
    }
    const placemark = new window.ymaps.Placemark(coords, { balloonContent }, { preset: "islands#redIcon" });
    mapInstanceRef.current.geoObjects.add(placemark);
    selectedPlacemarkRef.current = placemark;
  }, [allowAddressSelect]);

  const getAddressByCoords = useCallback(async (coords: number[], options?: { auto?: boolean }) => {
    if (!allowAddressSelect || !window.ymaps || !mapInstanceRef.current) return;
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
        // noop
      }
    }

    if (options?.auto && (!parsed.city || !parsed.street)) return;
    if (!isRussianCountry(parsed.country)) return;

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
  }, [allowAddressSelect, onAddressSelect, parseGeoObjectAddress, setSelectedPlacemark]);

  useEffect(() => {
    if (!YANDEX_MAPS_KEY) {
      setMapStatus("unavailable");
      return;
    }

    const initMap = () => {
      window.ymaps.ready(() => {
        try {
          if (!mapRef.current) return;
          const map = new window.ymaps.Map(
            mapRef.current,
            { center: [55.751574, 37.573856], zoom: 10, controls: ["zoomControl", "geolocationControl"] },
            { suppressMapOpenBlock: true },
          );
          map.controls?.remove?.("searchControl");
          map.controls?.remove?.("typeSelector");
          map.controls?.remove?.("trafficControl");
          map.controls?.remove?.("fullscreenControl");
          map.controls?.remove?.("rulerControl");
          map.behaviors?.enable?.("scrollZoom");
          if (allowAddressSelect) {
            const clusterer = new window.ymaps.Clusterer({
              groupByCoordinates: false,
              clusterDisableClickZoom: true,
              clusterOpenBalloonOnClick: false,
              preset: "islands#invertedBlueClusterIcons",
            });
            map.geoObjects.add(clusterer);
            clustererRef.current = clusterer;
            markerLayerRef.current = null;
          } else {
            clustererRef.current = null;
            const markerLayer = new window.ymaps.GeoObjectCollection();
            map.geoObjects.add(markerLayer);
            markerLayerRef.current = markerLayer;
          }
          map.events.add("click", (event: { get: (key: string) => number[] }) => {
            if (!allowAddressSelect) return;
            void getAddressByCoords(event.get("coords"));
          });
          map.events.add("boundschange", () => {
            const zoom = Number(map.getZoom?.() ?? 0);
            if (zoom > 0) onViewportChange?.({ zoom });
            if (viewportUpdateTimerRef.current) window.clearTimeout(viewportUpdateTimerRef.current);
            viewportUpdateTimerRef.current = window.setTimeout(() => setViewportTick((prev) => prev + 1), 120);
          });
          mapInstanceRef.current = map;
          setMapStatus("ready");
        } catch {
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
      if (YANDEX_SUGGEST_KEY) scriptUrl.searchParams.set("suggest_apikey", YANDEX_SUGGEST_KEY);
      script.src = scriptUrl.toString();
      script.async = true;
      script.onload = initMap;
      script.onerror = () => setMapStatus("unavailable");
      document.body.appendChild(script);
    } else {
      setMapStatus("unavailable");
    }

    return () => {
      if (viewportUpdateTimerRef.current) window.clearTimeout(viewportUpdateTimerRef.current);
      clustererRef.current = null;
      markerLayerRef.current = null;
      mapInstanceRef.current?.destroy?.();
    };
  }, [allowAddressSelect, getAddressByCoords, onViewportChange]);

  useEffect(() => {
    if (!window.ymaps || mapStatus !== "ready" || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    let markersForRender = markers;
    if (markers.length > MAX_RENDERED_MARKERS) {
      const bounds = map.getBounds?.();
      if (Array.isArray(bounds) && bounds.length === 2) {
        const [lower = [], upper = []] = bounds;
        const minLat = Math.min(Number(lower[0] ?? 0), Number(upper[0] ?? 0));
        const maxLat = Math.max(Number(lower[0] ?? 0), Number(upper[0] ?? 0));
        const minLng = Math.min(Number(lower[1] ?? 0), Number(upper[1] ?? 0));
        const maxLng = Math.max(Number(lower[1] ?? 0), Number(upper[1] ?? 0));
        const latPad = Math.max((maxLat - minLat) * 0.3, 0.05);
        const lngPad = Math.max((maxLng - minLng) * 0.3, 0.05);
        const bounded = markers.filter(
          (marker) =>
            marker.lat >= minLat - latPad &&
            marker.lat <= maxLat + latPad &&
            marker.lng >= minLng - lngPad &&
            marker.lng <= maxLng + lngPad,
        );
        if (bounded.length > 0) markersForRender = bounded;
      }
      if (markersForRender.length > MAX_RENDERED_MARKERS) {
        const center = map.getCenter?.() ?? [55.751574, 37.573856];
        const centerLat = Number(center[0] ?? 55.751574);
        const centerLng = Number(center[1] ?? 37.573856);
        markersForRender = [...markersForRender]
          .sort((a, b) => (a.lat - centerLat) ** 2 + (a.lng - centerLng) ** 2 - ((b.lat - centerLat) ** 2 + (b.lng - centerLng) ** 2))
          .slice(0, MAX_RENDERED_MARKERS);
      }
      if (selectedMarkerId && !markersForRender.some((marker) => marker.id === selectedMarkerId)) {
        const selected = markers.find((marker) => marker.id === selectedMarkerId);
        if (selected) markersForRender = [...markersForRender.slice(0, MAX_RENDERED_MARKERS - 1), selected];
      }
    }

    clustererRef.current?.removeAll?.();
    markerLayerRef.current?.removeAll?.();
    markerPlacemarksRef.current = [];
    for (const marker of markersForRender) {
      const isSelected = marker.id === selectedMarkerId;
      const placemark = new window.ymaps.Placemark(
        [marker.lat, marker.lng],
        allowAddressSelect
          ? {
              iconCaption: isSelected ? markerCaption(marker.title) : "",
              balloonContent: `<strong>${marker.title}</strong><br/>${marker.subtitle ?? ""}`,
            }
          : {
              iconCaption: isSelected ? markerCaption(marker.title) : "",
              hintContent: marker.subtitle ?? marker.title,
            },
        {
          preset: markerPreset(marker.provider, isSelected),
          hideIconOnBalloonOpen: false,
          hasBalloon: allowAddressSelect,
          openBalloonOnClick: false,
        },
      );
      placemark.events.add("click", (event: { stopPropagation?: () => void }) => {
        event.stopPropagation?.();
        onMarkerSelect?.(marker);
      });
      markerPlacemarksRef.current.push(placemark);
    }
    if (markerPlacemarksRef.current.length > 0) {
      if (allowAddressSelect && clustererRef.current) {
        clustererRef.current.add(markerPlacemarksRef.current);
      } else if (markerLayerRef.current) {
        markerPlacemarksRef.current.forEach((placemark) => {
          markerLayerRef.current.add(placemark);
        });
      }
    }
  }, [allowAddressSelect, mapStatus, markers, onMarkerSelect, selectedMarkerId, viewportTick]);

  useEffect(() => {
    const query = centerQuery?.trim();
    if (!query) {
      lastCenteredQueryRef.current = null;
      return;
    }
    if (mapStatus !== "ready" || !mapInstanceRef.current || !window.ymaps?.geocode) return;
    if (lastCenteredQueryRef.current === query) return;
    let cancelled = false;
    void window.ymaps.geocode(query).then((geocodeResult) => {
      if (cancelled) return;
      const firstGeoObject = geocodeResult?.geoObjects?.get?.(0);
      const coords = firstGeoObject?.geometry?.getCoordinates?.();
      if (Array.isArray(coords) && coords.length >= 2) {
        lastCenteredQueryRef.current = query;
        mapInstanceRef.current.setCenter(coords, 14);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [centerQuery, mapStatus]);

  const requestCurrentLocation = useCallback(() => {
    if (!allowAddressSelect || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = [position.coords.latitude, position.coords.longitude];
        if (position.coords.accuracy > 2000) return;
        if (mapStatus === "ready" && mapInstanceRef.current) {
          mapInstanceRef.current.setCenter(coords, 15);
          void getAddressByCoords(coords, { auto: true });
        }
      },
      () => {},
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }, [allowAddressSelect, getAddressByCoords, mapStatus]);

  useEffect(() => {
    if (!allowAddressSelect || mapStatus !== "ready" || typeof window === "undefined" || !navigator.geolocation || autoGeolocationRequestedRef.current) return;
    autoGeolocationRequestedRef.current = true;
    requestCurrentLocation();
  }, [allowAddressSelect, mapStatus, requestCurrentLocation]);

  useEffect(() => {
    if (mapStatus !== "ready" || !mapInstanceRef.current) return;
    let frameId = 0;
    const fit = () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        try {
          mapInstanceRef.current?.container?.fitToViewport?.();
        } catch {
          // noop
        }
      });
    };
    const timer1 = window.setTimeout(fit, 80);
    const timer2 = window.setTimeout(fit, 260);
    const timer3 = window.setTimeout(fit, 700);
    window.addEventListener("resize", fit, { passive: true });
    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      window.clearTimeout(timer1);
      window.clearTimeout(timer2);
      window.clearTimeout(timer3);
      window.removeEventListener("resize", fit);
    };
  }, [mapStatus, params.height]);

  useEffect(() => {
    if (mapStatus !== "ready" || !mapRef.current || !mapInstanceRef.current || typeof ResizeObserver === "undefined") return;
    let frameId = 0;
    const fit = () => {
      try {
        mapInstanceRef.current?.container?.fitToViewport?.();
      } catch {
        // noop
      }
    };
    const observer = new ResizeObserver(() => {
      if (frameId) window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(fit);
    });
    observer.observe(mapRef.current);
    return () => {
      observer.disconnect();
      if (frameId) window.cancelAnimationFrame(frameId);
    };
  }, [mapStatus]);

  return { mapRef, mapStatus };
}
