import React, { useEffect, useRef, useState } from "react";
import { Search, MapPin } from "lucide-react";

declare global {
  interface Window {
    ymaps: any;
  }
}

interface YandexMapPickerProps {
  onAddressSelect: (address: {
    city: string;
    street: string;
    building: string;
    postalCode: string;
  }) => void;
}

type MapStatus = "loading" | "ready" | "unavailable";

const YANDEX_MAPS_KEY =
  import.meta.env.VITE_YANDEX_MAPS_API_KEY?.toString().trim() ?? "";

function parseAddressInput(rawValue: string) {
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

export function YandexMapPicker({ onAddressSelect }: YandexMapPickerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const placemarkRef = useRef<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [mapStatus, setMapStatus] = useState<MapStatus>("loading");

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

        map.events.add("click", (event: any) => {
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

  const getAddressByCoords = async (coords: number[]) => {
    if (!window.ymaps || !mapInstanceRef.current) return;

    const geocode = await window.ymaps.geocode(coords);
    const firstGeoObject = geocode.geoObjects.get(0);
    if (!firstGeoObject) return;

    const addressComponents = firstGeoObject.properties.get(
      "metaDataProperty.GeocoderMetaData.Address.Components",
    ) as Array<{ kind: string; name: string }>;

    let city = "";
    let street = "";
    let building = "";
    let postalCode = "";

    addressComponents.forEach((component) => {
      switch (component.kind) {
        case "locality":
          city = component.name;
          break;
        case "street":
          street = component.name;
          break;
        case "house":
          building = component.name;
          break;
        case "postal_code":
          postalCode = component.name;
          break;
        default:
          break;
      }
    });

    if (!city) {
      const province = addressComponents.find(
        (component) =>
          component.kind === "province" || component.kind === "area",
      );
      city = province?.name ?? "";
    }

    if (placemarkRef.current) {
      mapInstanceRef.current.geoObjects.remove(placemarkRef.current);
    }

    const placemark = new window.ymaps.Placemark(
      coords,
      {
        balloonContent: firstGeoObject.properties.get("text"),
      },
      {
        preset: "islands#redDotIcon",
      },
    );

    mapInstanceRef.current.geoObjects.add(placemark);
    placemarkRef.current = placemark;

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
            ? "Нажмите на карту или введите адрес для поиска"
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
              включить выбор адреса на карте.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
