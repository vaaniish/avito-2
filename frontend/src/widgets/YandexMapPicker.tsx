import { MapPin } from "lucide-react";
import { useYandexMapPicker } from "./yandex-map.hooks";
import type { YandexMapPickerProps } from "./yandex-map.types";

export type { AddressPayload, YandexMapMarker } from "./yandex-map.types";

export function YandexMapPicker(props: YandexMapPickerProps) {
  const { mapRef, mapStatus } = useYandexMapPicker(props);

  return (
    <div className="w-full">
      <div
        ref={mapRef}
        className="w-full rounded-xl overflow-hidden bg-gray-100 relative"
        style={{
          height:
            typeof props.height === "number"
              ? `${Math.max(320, props.height)}px`
              : (props.height || "460px"),
        }}
      >
        {mapStatus === "loading" ? (
          <div className="w-full h-full flex items-center justify-center">
            <p className="text-gray-500">Загрузка карты...</p>
          </div>
        ) : null}

        {mapStatus === "unavailable" ? (
          <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-gradient-to-br from-gray-100 to-gray-200">
            <MapPin className="w-16 h-16 text-gray-400 mb-4" />
            <h4 className="text-lg text-gray-700 mb-2">Карта недоступна</h4>
            <p className="text-sm text-gray-600 max-w-md">
              Добавьте `VITE_YANDEX_MAPS_API_KEY` в окружение фронтенда, чтобы включить выбор адреса и ПВЗ на карте.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
