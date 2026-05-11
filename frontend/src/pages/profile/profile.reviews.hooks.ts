import { useCallback, useState } from "react";
import { apiPost } from "../../shared/lib/api";
import { notifyError, notifyInfo, notifySuccess } from "../../shared/ui/notifications";
import type { Order, OrderItem } from "./profile.models";

export function getOrderStatusMeta(status: Order["status"]) {
  const map: Record<Order["status"], { label: string; className: string }> = {
    processing: {
      label: "В обработке",
      className: "bg-amber-50 text-amber-700 border-amber-200",
    },
    prepared: {
      label: "Подготовлен",
      className: "bg-yellow-50 text-yellow-700 border-yellow-200",
    },
    shipped: {
      label: "Отправлен",
      className: "bg-blue-50 text-blue-700 border-blue-200",
    },
    completed: {
      label: "Завершен",
      className: "bg-emerald-50 text-emerald-700 border-emerald-200",
    },
    cancelled: {
      label: "Отменен",
      className: "bg-red-50 text-red-700 border-red-200",
    },
  };
  return map[status];
}

export function useProfileReviews(params: {
  loadProfile: (showGlobalLoader?: boolean) => Promise<void>;
}) {
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [itemToReview, setItemToReview] = useState<OrderItem | null>(null);
  const [reviewForm, setReviewForm] = useState({ rating: 0, comment: "" });

  const handlePostReview = useCallback(async () => {
    if (!itemToReview) return;
    if (reviewForm.rating === 0) {
      notifyInfo("Пожалуйста, поставьте оценку.");
      return;
    }
    if (reviewForm.comment.trim().length < 3) {
      notifyInfo("Комментарий слишком короткий.");
      return;
    }

    try {
      await apiPost(`/profile/listings/${itemToReview.listingPublicId}/review`, {
        rating: reviewForm.rating,
        comment: reviewForm.comment,
      });
      notifySuccess("Спасибо за ваш отзыв!");
      setReviewModalOpen(false);
      setItemToReview(null);
      setReviewForm({ rating: 0, comment: "" });
      await params.loadProfile();
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось отправить отзыв.");
    }
  }, [itemToReview, params, reviewForm.comment, reviewForm.rating]);

  const startReview = useCallback((item: OrderItem) => {
    setItemToReview(item);
    setReviewModalOpen(true);
  }, []);

  const closeReviewModal = useCallback(() => {
    setReviewModalOpen(false);
  }, []);

  return {
    getOrderStatusMeta,
    itemToReview,
    reviewForm,
    reviewModalOpen,
    closeReviewModal,
    handlePostReview,
    setReviewForm,
    startReview,
  };
}
