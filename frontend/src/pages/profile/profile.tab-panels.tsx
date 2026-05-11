import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Star } from "lucide-react";
import { AppModal } from "../../shared/ui/app-modal";
import type {
  Order,
  OrderItem,
  PartnershipForm,
  WishlistItem,
} from "./profile.models";

type ProfileOrdersTabProps = {
  orders: Order[];
  reviewModalOpen: boolean;
  itemToReview: OrderItem | null;
  reviewForm: { rating: number; comment: string };
  getOrderStatusMeta: (
    status: Order["status"],
  ) => { label: string; className: string };
  onOpenListing: (listingPublicId: string) => void;
  onStartReview: (item: OrderItem) => void;
  onReviewModalClose: () => void;
  onReviewRatingChange: (rating: number) => void;
  onReviewCommentChange: (comment: string) => void;
  onSubmitReview: () => void;
};

const INITIAL_VISIBLE_ORDERS = 16;
const ORDERS_PAGE_SIZE = 16;
const INITIAL_VISIBLE_WISHLIST = 24;
const WISHLIST_PAGE_SIZE = 24;

function formatBuyerDeliveryStatus(value: string | null | undefined): string {
  const key = String(value ?? "").trim().toUpperCase();
  if (!key) return "Ожидает передачи в доставку";
  const labels: Record<string, string> = {
    CREATED: "Заявка доставки создана",
    ACCEPTED: "Заявка принята службой доставки",
    IN_TRANSIT: "В пути",
    READY_FOR_DELIVERY: "Прибыло в ПВЗ",
    DELIVERED: "Выдано получателю",
    DELIVERY_ARRIVED_PICKUP_POINT: "Доставлен в ПВЗ",
    DELIVERY_TRANSMITTED_TO_RECIPIENT: "Выдан получателю",
    FINISHED: "Доставка завершена",
    CANCELLED: "Доставка отменена",
  };
  return labels[key] ?? value ?? "Ожидает передачи в доставку";
}

function buildBuyerTrackingLink(order: Order): string | null {
  const trackingNumber = order.trackingNumber?.trim() ?? "";
  const trackingUrl = order.trackingUrl?.trim();
  if (trackingUrl) return trackingUrl;
  if (!trackingNumber) return null;
  if (order.trackingProvider === "russian_post") {
    return `https://www.pochta.ru/tracking#${encodeURIComponent(trackingNumber)}`;
  }
  if (order.trackingProvider === "yandex_pvz") {
    return `https://dostavka.yandex.ru/route/${encodeURIComponent(trackingNumber)}`;
  }
  return null;
}

export function ProfileOrdersTab({
  orders,
  reviewModalOpen,
  itemToReview,
  reviewForm,
  getOrderStatusMeta,
  onOpenListing,
  onStartReview,
  onReviewModalClose,
  onReviewRatingChange,
  onReviewCommentChange,
  onSubmitReview,
}: ProfileOrdersTabProps) {
  const [visibleOrdersCount, setVisibleOrdersCount] = useState(INITIAL_VISIBLE_ORDERS);

  useEffect(() => {
    setVisibleOrdersCount((current) =>
      Math.min(Math.max(INITIAL_VISIBLE_ORDERS, current), orders.length),
    );
  }, [orders.length]);

  const visibleOrders = useMemo(
    () => orders.slice(0, visibleOrdersCount),
    [orders, visibleOrdersCount],
  );
  const hasMoreOrders = visibleOrdersCount < orders.length;

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold md:text-xl">История заказов</h3>
      {visibleOrders.map((order) => (
        <div
          key={order.id}
          className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="font-semibold">{order.orderNumber}</div>
              <div className="text-xs text-gray-500">
                {new Date(order.date).toLocaleString("ru-RU")}
              </div>
              <div className="text-sm text-gray-600">
                Продавец: {order.seller.name}
              </div>
            </div>
            <div className="flex flex-col items-start gap-1 text-left sm:items-end sm:text-right">
              <div className="text-sm">{order.total.toLocaleString("ru-RU")} ₽</div>
              <span
                className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${getOrderStatusMeta(order.status).className}`}
              >
                {getOrderStatusMeta(order.status).label}
              </span>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {order.items.map((item) => (
              <div key={item.id} className="flex items-center gap-3">
                <img
                  src={item.image}
                  alt={item.name}
                  className="w-12 h-12 rounded-lg object-cover"
                />
                <div className="flex-1">
                  {item.listingPublicId.trim() ? (
                    <button
                      type="button"
                      onClick={() => onOpenListing(item.listingPublicId)}
                      className="text-left text-sm font-medium text-blue-700 hover:underline"
                    >
                      {item.name}
                    </button>
                  ) : (
                    <p className="text-sm font-medium">{item.name}</p>
                  )}
                  <p className="text-sm text-gray-600">
                    {item.price.toLocaleString("ru-RU")} ₽ x {item.quantity}
                  </p>
                  {order.status !== "cancelled" ? (
                    <p className="mt-1 text-xs font-medium text-slate-500">
                      Товар находится в истории сделки и недоступен для повторной покупки.
                    </p>
                  ) : null}
                </div>
                {item.canReview ? (
                  <button
                    onClick={() => onStartReview(item)}
                    className="rounded-full border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 transition hover:border-blue-200 hover:text-blue-700"
                  >
                    Оставить отзыв
                  </button>
                ) : item.reviewed ? (
                  <span className="text-xs text-gray-500">Отзыв оставлен</span>
                ) : null}
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
            <div className="font-medium text-gray-900">Доставка</div>
            <div className="mt-1">ПВЗ: {order.deliveryAddress}</div>
            <div className="mt-1">
              Этап: {formatBuyerDeliveryStatus(order.deliveryExternalStatus)}
            </div>
            {order.trackingNumber ? (
              <div className="mt-1">
                Трек: <span className="font-medium">{order.trackingNumber}</span>
              </div>
            ) : null}
            {buildBuyerTrackingLink(order) ? (
              <a
                href={buildBuyerTrackingLink(order) ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-blue-700 hover:text-blue-800"
              >
                Отследить доставку
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : (
              <div className="mt-2 text-xs text-gray-500">
                Ссылка отслеживания появится после передачи заказа в доставку.
              </div>
            )}
          </div>
        </div>
      ))}
      {orders.length === 0 && (
        <div className="text-sm text-gray-500">Заказов пока нет</div>
      )}
      {hasMoreOrders ? (
        <button
          type="button"
          onClick={() =>
            setVisibleOrdersCount((current) =>
              Math.min(current + ORDERS_PAGE_SIZE, orders.length),
            )
          }
          className="btn-secondary px-4 py-2 text-sm"
        >
          Показать еще заказы
        </button>
      ) : null}

      {reviewModalOpen && itemToReview && (
        <AppModal
          open={reviewModalOpen}
          onClose={onReviewModalClose}
          title="Отзыв о товаре"
          size="md"
          footer={
            <>
              <button onClick={onReviewModalClose} className="btn-secondary flex-1 py-2.5">
                Отмена
              </button>
              <button onClick={onSubmitReview} className="btn-primary flex-1 py-2.5">
                Отправить отзыв
              </button>
            </>
          }
        >
            <p className="text-sm font-medium mb-2">{itemToReview.name}</p>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <p className="text-sm">Ваша оценка:</p>
                <div className="flex">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button key={star} onClick={() => onReviewRatingChange(star)}>
                      <Star
                        className={`w-6 h-6 cursor-pointer ${
                          star <= reviewForm.rating
                            ? "text-yellow-400 fill-yellow-400"
                            : "text-gray-300"
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                value={reviewForm.comment}
                onChange={(event) => onReviewCommentChange(event.target.value)}
                placeholder="Напишите ваш комментарий..."
                rows={4}
                className="field-control"
              />
            </div>
        </AppModal>
      )}
    </div>
  );
}

type ProfileWishlistTabProps = {
  wishlistItems: WishlistItem[];
  onOpenListing: (listingPublicId: string) => void;
  onRemoveWishlistItem: (listingPublicId: string) => void;
};

export function ProfileWishlistTab({
  wishlistItems,
  onOpenListing,
  onRemoveWishlistItem,
}: ProfileWishlistTabProps) {
  const [visibleWishlistCount, setVisibleWishlistCount] = useState(INITIAL_VISIBLE_WISHLIST);

  useEffect(() => {
    setVisibleWishlistCount((current) =>
      Math.min(Math.max(INITIAL_VISIBLE_WISHLIST, current), wishlistItems.length),
    );
  }, [wishlistItems.length]);

  const visibleWishlistItems = useMemo(
    () => wishlistItems.slice(0, visibleWishlistCount),
    [visibleWishlistCount, wishlistItems],
  );
  const hasMoreWishlistItems = visibleWishlistCount < wishlistItems.length;

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold md:text-xl">Избранные товары</h3>
      {visibleWishlistItems.map((item) => (
        <div
          key={item.id}
          className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
        >
          <img src={item.image} alt={item.name} className="w-16 h-16 rounded-lg object-cover" />
          <div className="flex-1">
            <button
              type="button"
              onClick={() => onOpenListing(item.id)}
              className="text-left font-medium text-blue-700 hover:underline"
            >
              {item.name}
            </button>
            <div className="text-sm text-gray-600">
              {item.price.toLocaleString("ru-RU")} ₽ • {item.seller}
            </div>
          </div>
          <button
            onClick={() => onRemoveWishlistItem(item.id)}
            className="btn-secondary px-3 py-1.5 text-sm text-red-600"
          >
            Удалить
          </button>
        </div>
      ))}
      {wishlistItems.length === 0 && (
        <div className="text-sm text-gray-500">Избранное пусто</div>
      )}
      {hasMoreWishlistItems ? (
        <button
          type="button"
          onClick={() =>
            setVisibleWishlistCount((current) =>
              Math.min(current + WISHLIST_PAGE_SIZE, wishlistItems.length),
            )
          }
          className="btn-secondary px-4 py-2 text-sm"
        >
          Показать еще товары
        </button>
      ) : null}
    </div>
  );
}

type ProfilePartnershipTabProps = {
  partnershipForm: PartnershipForm;
  onFieldChange: (field: keyof PartnershipForm, value: string) => void;
  policyAccepted: boolean;
  policyTitle: string;
  policyUrl: string;
  onPolicyAcceptedChange: (value: boolean) => void;
  onSubmit: () => void;
};

export function ProfilePartnershipTab({
  partnershipForm,
  onFieldChange,
  policyAccepted,
  policyTitle,
  policyUrl,
  onPolicyAcceptedChange,
  onSubmit,
}: ProfilePartnershipTabProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold md:text-xl">Заявка на партнерство</h3>
      <p className="text-xs text-gray-500">
        Отбор только для ИП, юрлиц и брендов из электроники, бытовой техники и профильного ремонта. Частных продавцов в MVP не подключаем.
      </p>
      <div className="grid grid-cols-1 gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600 md:grid-cols-3">
        <div>
          <div className="mb-1 font-semibold text-gray-900">Юридическая проверка</div>
          <div>ИНН, сайт или витрина, контакт ответственного.</div>
        </div>
        <div>
          <div className="mb-1 font-semibold text-gray-900">Профильность</div>
          <div>Только техника, электроника, ремонт и диагностика.</div>
        </div>
        <div>
          <div className="mb-1 font-semibold text-gray-900">Надежность</div>
          <div>Публичный профиль, гарантия, возвраты и сервисный процесс.</div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <select
          value={partnershipForm.sellerType}
          onChange={(event) => onFieldChange("sellerType", event.target.value)}
          className="field-control"
        >
          <option value="company">Компания</option>
          <option value="ip">ИП</option>
          <option value="brand">Бренд</option>
        </select>
        <input
          value={partnershipForm.name}
          onChange={(event) => onFieldChange("name", event.target.value)}
          placeholder="Название компании / ИП"
          className="field-control"
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <input
          value={partnershipForm.email}
          onChange={(event) => onFieldChange("email", event.target.value)}
          placeholder="Email"
          className="field-control"
        />
        <input
          value={partnershipForm.contact}
          onChange={(event) => onFieldChange("contact", event.target.value)}
          placeholder="Телефон ответственного / Telegram"
          className="field-control"
        />
      </div>
      <input
        value={partnershipForm.link}
        onChange={(event) => onFieldChange("link", event.target.value)}
        placeholder="Сайт компании или витрина в маркетплейсе (https://...)"
        className="field-control"
      />
      <select
        value={partnershipForm.category}
        onChange={(event) => onFieldChange("category", event.target.value)}
        className="field-control"
      >
        <option value="">Категория</option>
        <option value="smartphones">Смартфоны</option>
        <option value="laptops">Ноутбуки</option>
        <option value="tablets">Планшеты</option>
        <option value="audio">Аудио</option>
        <option value="wearables">Носимая электроника</option>
        <option value="gaming">Игровая электроника</option>
        <option value="components">Комплектующие</option>
        <option value="accessories">Аксессуары</option>
        <option value="home_appliances">Бытовая техника</option>
        <option value="kitchen_appliances">Кухонная техника</option>
        <option value="electronics_repair">Ремонт электроники</option>
        <option value="home_appliance_repair">Ремонт бытовой техники</option>
      </select>
      <input
        value={partnershipForm.inn}
        onChange={(event) => onFieldChange("inn", event.target.value)}
        placeholder="ИНН (10 или 12 цифр)"
        className="field-control"
      />
      <input
        value={partnershipForm.geography}
        onChange={(event) => onFieldChange("geography", event.target.value)}
        placeholder="География работы (города, регионы)"
        className="field-control"
      />
      <input
        value={partnershipForm.socialProfile}
        onChange={(event) => onFieldChange("socialProfile", event.target.value)}
        placeholder="Публичный профиль компании: 2GIS / Я.Карты / отзывы / B2B-каталог (https://...)"
        className="field-control"
      />
      <textarea
        value={partnershipForm.credibility}
        onChange={(event) => onFieldChange("credibility", event.target.value)}
        placeholder="Почему вам можно доверять: опыт в нише, гарантия, возвраты, SLA ответа, диагностика, сервисный процесс"
        rows={3}
        className="field-control"
      />
      <textarea
        value={partnershipForm.whyUs}
        onChange={(event) => onFieldChange("whyUs", event.target.value)}
        placeholder="Что будете продавать или ремонтировать, какой объем готовы держать и какую категорию закроете лучше конкурентов"
        rows={4}
        className="field-control"
      />
      <label className="flex items-start gap-2 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={policyAccepted}
          onChange={(event) => onPolicyAcceptedChange(event.target.checked)}
          className="mt-0.5"
        />
        <span>
          Я принимаю{" "}
          <a href={policyUrl} target="_blank" rel="noreferrer" className="text-blue-700 underline">
            {policyTitle}
          </a>
        </span>
      </label>
      <button onClick={onSubmit} className="btn-primary px-4 py-2.5">
        Отправить заявку
      </button>
    </div>
  );
}
