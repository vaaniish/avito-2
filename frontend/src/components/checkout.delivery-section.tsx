import type { MutableRefObject } from "react";
import { MapPin, Search, X } from "lucide-react";
import { YandexMapPicker, type YandexMapMarker } from "./YandexMapPicker";
import {
  DELIVERY_PROVIDER_TABS,
  type DeliveryPoint,
  type DeliveryProvider,
} from "./checkout.models";

type CheckoutDeliverySectionProps = {
  deliveryType: "delivery" | "pickup";
  deliveryProviders: DeliveryProvider[];
  activeDeliveryProvider: DeliveryProvider["code"];
  deliveryCity: string;
  deliverySearchInputRef: MutableRefObject<HTMLInputElement | null>;
  mapMarkers: YandexMapMarker[];
  mapCenterQuery: string | null;
  selectedPointId: string | null;
  visibleDeliveryPoints: DeliveryPoint[];
  selectedPoint: DeliveryPoint | null;
  isPointsLoading: boolean;
  onProviderSelect: (providerCode: DeliveryProvider["code"]) => void;
  onDeliveryCityChange: (value: string) => void;
  onSearch: () => void;
  onClearSearch: () => void;
  onMarkerSelect: (markerId: string) => void;
};

export function CheckoutDeliverySection({
  deliveryType,
  deliveryProviders,
  activeDeliveryProvider,
  deliveryCity,
  deliverySearchInputRef,
  mapMarkers,
  mapCenterQuery,
  selectedPointId,
  visibleDeliveryPoints,
  selectedPoint,
  isPointsLoading,
  onProviderSelect,
  onDeliveryCityChange,
  onSearch,
  onClearSearch,
  onMarkerSelect,
}: CheckoutDeliverySectionProps) {
  if (deliveryType !== "delivery") {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 md:p-8">
        <h2 className="mb-4 text-xl text-gray-900 md:text-2xl">Самовывоз</h2>
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <div className="mb-2 flex items-center gap-2 text-gray-900">
            <MapPin className="h-4 w-4" />
            <span className="font-medium">Вы выбрали самовывоз</span>
          </div>
          <p className="text-sm text-gray-600">
            После оформления заказа продавец свяжется с вами для согласования
            точки и времени получения.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 md:p-8">
      <h2 className="mb-4 text-xl text-gray-900 md:text-2xl">Выберите ПВЗ</h2>
      <p className="mb-4 text-sm text-gray-600">
        На карте показаны доступные точки выдачи выбранного провайдера. Введите
        адрес или название ПВЗ, затем выберите нужную метку на карте.
      </p>
      <div className="mb-4 flex flex-wrap gap-2">
        {DELIVERY_PROVIDER_TABS.map((tab) => {
          const tabAvailable =
            tab.enabled &&
            deliveryProviders.some((provider) => provider.code === tab.code);

          return (
            <button
              key={tab.code}
              type="button"
              disabled={!tabAvailable}
              onClick={() => {
                if (!tabAvailable) {
                  return;
                }
                onProviderSelect(tab.code);
              }}
              className={`rounded-full border px-3 py-1.5 text-xs md:text-sm ${
                !tabAvailable
                  ? "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400"
                  : activeDeliveryProvider === tab.code
                    ? "border-blue-300 bg-blue-100 text-blue-700"
                    : "border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:text-blue-700"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="mb-4">
        <div className="flex items-center rounded-xl border border-slate-300 bg-white px-4 py-3 transition focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100">
          <Search className="mr-3 h-5 w-5 text-slate-400" />
          <input
            ref={deliverySearchInputRef}
            value={deliveryCity}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onSearch();
              }
            }}
            onChange={(event) => {
              onDeliveryCityChange(event.target.value);
            }}
            placeholder="Введите адрес или название ПВЗ"
            className="h-8 w-full border-0 bg-transparent text-lg text-slate-900 outline-none placeholder:text-slate-400"
          />
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onSearch}
            className="ml-2 rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-white transition hover:bg-slate-800 md:text-sm"
          >
            Найти
          </button>
          {deliveryCity.trim().length > 0 && (
            <button
              onMouseDown={(event) => event.preventDefault()}
              onClick={onClearSearch}
              className="ml-3 rounded-md p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
              aria-label="Очистить поиск"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      <div className="h-[420px]">
        <YandexMapPicker
          markers={mapMarkers}
          centerQuery={mapCenterQuery}
          selectedMarkerId={selectedPointId}
          onMarkerSelect={(marker) => {
            onMarkerSelect(marker.id);
          }}
          allowAddressSelect={false}
          onAddressSelect={() => {}}
        />
      </div>

      <div className="mt-4 text-sm text-gray-500">
        {isPointsLoading && <div>Загрузка ПВЗ...</div>}
        {!isPointsLoading &&
          visibleDeliveryPoints.length === 0 &&
          deliveryCity.trim().length === 0 && (
            <div>Введите адрес или название ПВЗ, чтобы загрузить метки на карте.</div>
          )}
        {!isPointsLoading &&
          visibleDeliveryPoints.length === 0 &&
          deliveryCity.trim().length > 0 && <div>По вашему запросу ПВЗ не найдены.</div>}
        {!isPointsLoading && visibleDeliveryPoints.length > 0 && !selectedPoint && (
          <div>Нажмите на метку на карте, чтобы выбрать конкретный ПВЗ.</div>
        )}
      </div>

      <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
        {selectedPoint
          ? `Выбранная точка (${selectedPoint.providerLabel}): ${selectedPoint.name} - ${selectedPoint.address}`
          : "ПВЗ еще не выбран. Выберите метку на карте."}
        {selectedPoint && (
          <div className="mt-1 text-xs text-gray-600">
            Город: {selectedPoint.city}. Режим работы: {selectedPoint.workHours || "По расписанию"}.
          </div>
        )}
      </div>
    </div>
  );
}
