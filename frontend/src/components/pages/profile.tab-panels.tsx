import { Star, X } from "lucide-react";
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
  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold md:text-xl">История заказов</h3>
      {orders.map((order) => (
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
                </div>
                {order.status === "completed" && (
                  <button
                    onClick={() => onStartReview(item)}
                    className="btn-secondary text-xs px-2 py-1.5"
                  >
                    Оставить отзыв
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
      {orders.length === 0 && (
        <div className="text-sm text-gray-500">Заказов пока нет</div>
      )}

      {reviewModalOpen && itemToReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="app-modal-panel p-6">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-semibold">Отзыв о товаре</h4>
              <button onClick={onReviewModalClose}>
                <X className="w-5 h-5" />
              </button>
            </div>
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
            <div className="flex gap-2 mt-4">
              <button onClick={onSubmitReview} className="btn-primary flex-1 py-2.5">
                Отправить отзыв
              </button>
              <button onClick={onReviewModalClose} className="btn-secondary flex-1 py-2.5">
                Отмена
              </button>
            </div>
          </div>
        </div>
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
  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold md:text-xl">Избранные товары</h3>
      {wishlistItems.map((item) => (
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <select
          value={partnershipForm.sellerType}
          onChange={(event) => onFieldChange("sellerType", event.target.value)}
          className="field-control"
        >
          <option value="company">Компания</option>
          <option value="ip">ИП</option>
          <option value="brand">Бренд</option>
          <option value="admin_approved">Индивидуальное одобрение</option>
        </select>
        <input
          value={partnershipForm.name}
          onChange={(event) => onFieldChange("name", event.target.value)}
          placeholder="Название / ФИО"
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
          placeholder="Контакт"
          className="field-control"
        />
      </div>
      <input
        value={partnershipForm.link}
        onChange={(event) => onFieldChange("link", event.target.value)}
        placeholder="Ссылка на сайт/профиль"
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
        placeholder="ИНН (опционально)"
        className="field-control"
      />
      <textarea
        value={partnershipForm.whyUs}
        onChange={(event) => onFieldChange("whyUs", event.target.value)}
        placeholder="Почему хотите работать с нами"
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
