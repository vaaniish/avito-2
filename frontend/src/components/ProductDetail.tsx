import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Bell,
  Heart,
  MapPin,
  Minus,
  Plus,
  Send,
  ShoppingCart,
  Star,
  User,
  Zap,
} from "lucide-react";
import type { Product } from "../types";
import { apiDelete, apiGet, apiPost } from "../lib/api";

interface ProductDetailProps {
  product: Product;
  onBack: () => void;
  onAddToCart: (product: Product) => void;
  onBuyNow: (product: Product) => void;
  onUpdateQuantity?: (productId: string, quantity: number) => void;
  cartQuantity?: number;
  relatedProducts: Product[];
}

type QuestionItem = {
  id: string;
  user: string;
  date: string;
  question: string;
  answer?: string | null;
  answerDate?: string | null;
  helpful?: number;
};

export function ProductDetail({
  product,
  onBack,
  onAddToCart,
  onBuyNow,
  onUpdateQuantity,
  cartQuantity = 0,
}: ProductDetailProps) {
  const [selectedImage, setSelectedImage] = useState(0);
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [newQuestion, setNewQuestion] = useState("");
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [isQuestionsLoading, setIsQuestionsLoading] = useState(false);

  const images = useMemo(() => product.images || [product.image], [product.images, product.image]);
  const displayPrice = product.isSale && product.salePrice ? product.salePrice : product.price;
  const isInCart = cartQuantity > 0;

  useEffect(() => {
    let ignore = false;

    const loadQuestions = async () => {
      setIsQuestionsLoading(true);
      try {
        const result = await apiGet<QuestionItem[]>(`/catalog/listings/${product.id}/questions`);
        if (!ignore) {
          const normalized = result.map((item) => ({
            ...item,
            date: new Date(item.date).toLocaleDateString("ru-RU"),
            answerDate: item.answerDate ? new Date(item.answerDate).toLocaleDateString("ru-RU") : null,
          }));
          setQuestions(normalized);
        }
      } catch (_error) {
        if (!ignore) setQuestions([]);
      } finally {
        if (!ignore) setIsQuestionsLoading(false);
      }
    };

    void loadQuestions();

    return () => {
      ignore = true;
    };
  }, [product.id]);

  const handleAddToCart = () => {
    if (!isInCart) {
      onAddToCart(product);
    }
  };

  const handleQuantityChange = (newQuantity: number) => {
    if (onUpdateQuantity && newQuantity >= 0) {
      onUpdateQuantity(product.id, newQuantity);
    }
  };

  const handleSubmitQuestion = async () => {
    const questionText = newQuestion.trim();
    if (questionText.length < 3) return;

    try {
      const created = await apiPost<QuestionItem>(`/catalog/listings/${product.id}/questions`, {
        question: questionText,
      });

      setQuestions((prev) => [
        {
          ...created,
          date: new Date(created.date).toLocaleDateString("ru-RU"),
          answerDate: created.answerDate ? new Date(created.answerDate).toLocaleDateString("ru-RU") : null,
        },
        ...prev,
      ]);
      setNewQuestion("");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Не удалось отправить вопрос");
    }
  };

  const handleToggleWishlist = async () => {
    try {
      if (isWishlisted) {
        await apiDelete<{ success: boolean }>(`/profile/wishlist/${product.id}`);
      } else {
        await apiPost<{ success: boolean }>(`/profile/wishlist/${product.id}`);
      }
      setIsWishlisted((prev) => !prev);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Не удалось изменить избранное");
    }
  };

  return (
    <div className="app-shell">
      <div className="page-container py-4 md:py-6">
        <button
          onClick={onBack}
          className="back-link text-sm md:text-base"
        >
          <ArrowLeft className="w-4 h-4 md:w-5 md:h-5" />
          Назад к каталогу
        </button>
      </div>

      <div className="page-container grid grid-cols-1 gap-8 pb-8 md:pb-16 lg:grid-cols-[1fr_400px]">
        <div>
          <h1 className="text-2xl md:text-4xl text-black mb-6">{product.title}</h1>

          <div className="mb-6">
            <div className="bg-gray-100 rounded-2xl overflow-hidden mb-3 aspect-square md:aspect-[4/3] border border-gray-200">
              <img src={images[selectedImage]} alt={product.title} className="w-full h-full object-cover" />
            </div>
            {images.length > 1 && (
              <div className="grid grid-cols-5 md:grid-cols-8 gap-2">
                {images.map((image, index) => (
                  <button
                    key={`${image}-${index}`}
                    onClick={() => setSelectedImage(index)}
                    className={`aspect-square rounded-lg overflow-hidden border-2 ${
                      selectedImage === index ? "border-gray-900" : "border-gray-200"
                    }`}
                  >
                    <img src={image} alt={`preview-${index}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mb-6">
            <h2 className="text-xl md:text-2xl text-gray-900 mb-2">Описание</h2>
            <p className="text-sm md:text-base text-gray-700 leading-relaxed whitespace-pre-line">
              {product.description || "Описание отсутствует"}
            </p>
          </div>

          <div className="mb-6">
            <h2 className="text-xl md:text-2xl text-gray-900 mb-2">Местоположение</h2>
            <div className="flex items-center gap-2 text-gray-700">
              <MapPin className="w-4 h-4" />
              <span>{product.city || "Москва"}</span>
            </div>
          </div>

          {product.specifications && Object.keys(product.specifications).length > 0 && (
            <div className="mb-8">
              <h2 className="text-xl md:text-2xl text-gray-900 mb-3">Характеристики</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
                {Object.entries(product.specifications).map(([key, value]) => (
                  <div key={key} className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-sm text-gray-600">{key}</span>
                    <span className="text-sm text-gray-900">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-8 border-t border-gray-200 pt-6">
            <h2 className="text-xl md:text-2xl text-gray-900 mb-2">Отзывы</h2>
            <p className="text-sm text-gray-600 mb-4">Всего: {product.reviews?.length ?? 0}</p>
            <div className="space-y-4">
              {(product.reviews ?? []).map((review) => (
                <div key={review.id} className="border border-gray-200 rounded-xl p-4 bg-white">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden flex-shrink-0">
                      {review.avatar ? (
                        <img src={review.avatar} alt={review.author} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-500">
                          <User className="w-5 h-5" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{review.author}</p>
                          <p className="text-xs text-gray-500">{review.date}</p>
                        </div>
                        <div className="flex items-center gap-0.5">
                          {[...Array(5)].map((_, i) => (
                            <Star
                              key={i}
                              className={`w-4 h-4 ${
                                i < review.rating ? "text-yellow-400 fill-yellow-400" : "text-gray-300"
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                      <p className="text-sm text-gray-700 mt-2">{review.comment}</p>
                    </div>
                  </div>
                </div>
              ))}
              {(product.reviews?.length ?? 0) === 0 && (
                <p className="text-sm text-gray-500">Отзывов пока нет.</p>
              )}
            </div>
          </div>

          <div className="mt-8 border-t border-gray-200 pt-6">
            <h2 className="text-xl md:text-2xl text-gray-900 mb-2">Вопросы и ответы</h2>
            <p className="text-sm text-gray-600 mb-4">Всего: {questions.length}</p>

            <div className="mb-6 bg-gray-50 rounded-xl p-4 border border-gray-200">
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  placeholder="Задайте вопрос продавцу"
                  value={newQuestion}
                  onChange={(event) => setNewQuestion(event.target.value)}
                  className="field-control text-sm"
                />
                <button
                  onClick={() => void handleSubmitQuestion()}
                  className="btn-primary flex items-center justify-center gap-2 px-6 py-3 text-sm"
                >
                  <Send className="w-4 h-4" /> Отправить
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {isQuestionsLoading && <p className="text-sm text-gray-500">Загрузка вопросов...</p>}
              {!isQuestionsLoading && questions.length === 0 && (
                <p className="text-sm text-gray-500">Пока нет вопросов по этому товару.</p>
              )}

              {questions.map((item) => (
                <div key={item.id} className="border border-gray-200 rounded-xl p-4 bg-white">
                  <div className="text-sm text-gray-500 mb-1">
                    {item.user} • {item.date}
                  </div>
                  <p className="text-sm text-gray-900 mb-3">{item.question}</p>
                  {item.answer ? (
                    <div className="pl-3 border-l-2 border-gray-200">
                      <div className="text-xs text-[rgb(38,83,141)] mb-1">Ответ продавца {item.answerDate || ""}</div>
                      <p className="text-sm text-gray-700">{item.answer}</p>
                    </div>
                  ) : (
                    <div className="text-xs text-gray-500">Ожидает ответа продавца</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:sticky lg:top-32 h-fit">
          <div className="bg-white border border-gray-200 rounded-2xl p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="text-3xl text-black">{displayPrice.toLocaleString("ru-RU")} ₽</div>
                {product.isSale && product.salePrice && (
                  <div className="text-base text-gray-400 line-through">{product.price.toLocaleString("ru-RU")} ₽</div>
                )}
              </div>
              <button
                onClick={() => void handleToggleWishlist()}
                className="w-10 h-10 rounded-lg border border-gray-300 hover:bg-gray-50 flex items-center justify-center"
              >
                <Heart className={`w-5 h-5 ${isWishlisted ? "fill-red-500 text-red-500" : "text-gray-600"}`} />
              </button>
            </div>

            <div className="flex items-center gap-2 mb-4">
              <div className="flex items-center gap-1 px-2 py-1 bg-green-500 text-white rounded-lg">
                <span className="text-sm">{product.rating}</span>
              </div>
              <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
            </div>

            {isInCart ? (
              <div className="w-full py-3 bg-gray-100 text-gray-900 rounded-xl flex items-center justify-center gap-6 mb-4 border border-gray-200">
                <button
                  onClick={() => handleQuantityChange(cartQuantity - 1)}
                  className="w-10 h-10 rounded-lg bg-white border border-gray-300 hover:bg-gray-900 hover:text-white transition-all duration-300 flex items-center justify-center"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="text-base min-w-[40px] text-center">{cartQuantity}</span>
                <button
                  onClick={() => handleQuantityChange(cartQuantity + 1)}
                  className="w-10 h-10 rounded-lg bg-white border border-gray-300 hover:bg-gray-900 hover:text-white transition-all duration-300 flex items-center justify-center"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex flex-col w-full items-center gap-2 mb-4">
                <button
                  onClick={handleAddToCart}
                  className="btn-primary flex w-full items-center justify-center gap-2 py-3 text-sm"
                >
                  <ShoppingCart className="w-4 h-4" />
                  Добавить в корзину
                </button>
                <button
                  onClick={() => onBuyNow(product)}
                  className="btn-primary flex w-full items-center justify-center gap-2 py-3 text-sm"
                >
                  <Zap className="w-4 h-4" />
                  Купить сейчас
                </button>
              </div>
            )}

            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-gray-300 overflow-hidden flex-shrink-0">
                  {product.sellerAvatar ? (
                    <img src={product.sellerAvatar} alt={product.seller} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-600">
                      <User className="w-5 h-5" />
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-sm text-gray-900">{product.seller}</p>
                  <p className="text-xs text-gray-600">{product.sellerListings || 0} объявлений</p>
                </div>
              </div>
              <button
                onClick={() => setIsSubscribed((prev) => !prev)}
                className={`w-full py-2 px-4 rounded-lg text-xs transition-all duration-300 flex items-center justify-center gap-2 ${
                  isSubscribed ? "bg-gray-900 text-white" : "border border-gray-300 text-gray-900 hover:bg-gray-100"
                }`}
              >
                <Bell className="w-3 h-3" />
                {isSubscribed ? "Вы подписаны" : "Подписаться"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
