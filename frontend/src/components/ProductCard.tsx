import React from "react";
import {
  Star,
  Heart,
  ShoppingCart,
  Plus,
  Minus,
  MapPin,
} from "lucide-react";
import type { Product } from "../types";
import { GlowButton } from "./ui/glow-button";

interface ProductCardProps {
  product: Product;
  onClick: () => void;
  onAddToCart: () => void;
  onUpdateQuantity?: (quantity: number) => void;
  cartQuantity?: number;
  viewMode: "products" | "services";
  displayMode?: "grid" | "list";
  isWishlisted?: boolean;
  onWishlistToggle?: (productId: string, isWishlisted: boolean) => void;
}

export function ProductCard({
  product,
  onClick,
  onAddToCart,
  onUpdateQuantity,
  cartQuantity = 0,
  viewMode: _viewMode,
  displayMode = "grid",
  isWishlisted = false,
  onWishlistToggle,
}: ProductCardProps) {
  const handleAddToCart = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAddToCart();
  };

  const handleIncrement = (e: React.MouseEvent) => {
    e.stopPropagation();
    onUpdateQuantity?.(cartQuantity + 1);
  };

  const handleDecrement = (e: React.MouseEvent) => {
    e.stopPropagation();
    onUpdateQuantity?.(Math.max(0, cartQuantity - 1));
  };

  const handleWishlist = (e: React.MouseEvent) => {
    e.stopPropagation();
    onWishlistToggle?.(product.id, !isWishlisted);
  };

  const displayPrice = product.isSale && product.salePrice ? product.salePrice : product.price;
  const discountPercent =
    product.isSale && product.salePrice
      ? Math.round(((product.price - product.salePrice) / product.price) * 100)
      : 0;

  const city = product.city || "Не указан";
  const sellerReviewsCount = product.sellerReviewsCount ?? product.reviews?.length ?? 0;
  const sellerRating = product.sellerRating ?? (sellerReviewsCount > 0 ? product.rating : 0);
  const sellerRatingValue = sellerReviewsCount > 0 ? sellerRating.toFixed(1) : "—";
  const sellerReviewsCountValue = Math.max(0, sellerReviewsCount);

  if (displayMode === "list") {
    return (
      <div
        onClick={onClick}
        className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white p-4 transition-shadow duration-200 hover:shadow-lg"
      >
        <div className="flex items-start gap-4">
          <div className="relative h-[220px] w-[220px] flex-shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
            <img
              src={product.image}
              alt={product.title}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <button
              onClick={handleWishlist}
              className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/95 shadow-sm"
              aria-label="wishlist"
            >
              <Heart className={`h-4 w-4 ${isWishlisted ? "fill-red-500 text-red-500" : "text-gray-600"}`} />
            </button>
          </div>

          <div className="flex max-w-[500px] flex-1 flex-col">
            <h3 className="line-clamp-1 text-[18px] leading-tight text-black">{product.title}</h3>

            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-[24px] font-bold text-black">{displayPrice.toLocaleString("ru-RU")} ₽</span>

              {product.isSale && product.salePrice && discountPercent > 0 ? (
                <>
                  <span className="text-[13px] text-gray-400 line-through">{product.price.toLocaleString("ru-RU")} ₽</span>
                  <span className="text-[13px] font-medium text-red-500">-{discountPercent}%</span>
                </>
              ) : null}
            </div>

            <div className="mt-3 flex items-center gap-2 text-[13px] text-[rgb(68,68,68)]">
              <div className="flex min-w-0 items-center gap-1">
                <span className="max-w-[240px] truncate">{product.seller}</span>
                <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                <span className="tabular-nums">{sellerRatingValue}</span>
                <span className="tabular-nums text-gray-500">({sellerReviewsCountValue})</span>
              </div>
              <div className="flex items-center gap-1 text-gray-500">
                <MapPin className="h-3.5 w-3.5" />
                <span>{city}</span>
              </div>
            </div>

            <p className="mt-2 line-clamp-2 text-[14px] text-[#888888]">
              {product.title}. Высокое качество, быстрая доставка. Гарантия производителя.
            </p>
          </div>

          <div className="ml-auto w-[180px] flex-shrink-0">
            <div className="h-11">
              {cartQuantity > 0 ? (
                <div className="flex h-full w-full items-center justify-between gap-2 rounded-xl bg-black px-2">
                  <button
                    onClick={handleDecrement}
                    className="flex h-8 w-8 items-center justify-center rounded-md transition-colors duration-200 hover:bg-gray-800"
                    aria-label="decrement"
                  >
                    <Minus className="h-4 w-4 text-white" />
                  </button>
                  <span className="px-2 text-sm text-white">{cartQuantity}</span>
                  <button
                    onClick={handleIncrement}
                    className="flex h-8 w-8 items-center justify-center rounded-md transition-colors duration-200 hover:bg-gray-800"
                    aria-label="increment"
                  >
                    <Plus className="h-4 w-4 text-white" />
                  </button>
                </div>
              ) : (
                <GlowButton
                  onClick={handleAddToCart}
                  className="relative flex h-full w-full items-center justify-center gap-1.5 overflow-hidden rounded-xl bg-[rgb(38,83,141)] text-[15px] text-white"
                >
                  <ShoppingCart className="relative z-10 h-4 w-4" />
                  <span className="relative z-10">В Корзину</span>
                </GlowButton>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className="group relative cursor-pointer overflow-hidden rounded-xl border border-gray-200 bg-white transition-shadow duration-200 hover:shadow-lg"
    >
      <div className="relative aspect-square overflow-hidden bg-gray-50">
        <img
          src={product.image}
          alt={product.title}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute right-2 top-2">
          <button
            onClick={handleWishlist}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/95 shadow-sm"
            aria-label="wishlist"
          >
            <Heart className={`h-4 w-4 ${isWishlisted ? "fill-red-500 text-red-500" : "text-gray-600"}`} />
          </button>
        </div>
      </div>

      <div className="flex flex-col p-2">
        <h3 className="h-14 line-clamp-2 text-[17px] font-semibold text-black">{product.title}</h3>

        <div className="flex-grow" />

        <div className="mt-2">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[22px] font-bold text-black">{displayPrice.toLocaleString("ru-RU")} ₽</span>
            {product.isSale && product.salePrice && discountPercent > 0 ? (
              <>
                <span className="text-xs text-gray-400 line-through">{product.price.toLocaleString("ru-RU")} ₽</span>
                <span className="text-xs text-red-500">-{discountPercent}%</span>
              </>
            ) : null}
          </div>

          <div className="mt-1 flex min-w-0 items-center gap-1 text-[12px] text-[rgb(68,68,68)]">
            <span className="max-w-[62%] truncate">{product.seller}</span>
            <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
            <span className="tabular-nums">{sellerRatingValue}</span>
            <span className="tabular-nums text-gray-500">({sellerReviewsCountValue})</span>
          </div>

          <div className="mb-2 mt-1 flex items-center gap-1 text-[12px] text-[rgb(119,119,119)]">
            <MapPin className="h-3.5 w-3.5" />
            <span>{city}</span>
          </div>

          <div className="h-11">
            {cartQuantity > 0 ? (
              <div className="flex h-full w-full items-center justify-between gap-2 rounded-[12px] bg-[rgb(38,83,141)] px-2">
                <button
                  onClick={handleDecrement}
                  className="flex h-7 w-7 items-center justify-center rounded-md transition-colors duration-200 hover:bg-[rgba(255,255,255,0.2)]"
                  aria-label="decrement"
                >
                  <Minus className="h-3.5 w-3.5 text-white" />
                </button>
                <span className="min-w-[2rem] text-center text-[16px] text-white">В корзине: {cartQuantity}</span>
                <button
                  onClick={handleIncrement}
                  className="flex h-7 w-7 items-center justify-center rounded-md transition-colors duration-200 hover:bg-[rgba(255,255,255,0.2)]"
                  aria-label="increment"
                >
                  <Plus className="h-3.5 w-3.5 text-white" />
                </button>
              </div>
            ) : (
              <GlowButton
                onClick={handleAddToCart}
                className="h-full w-full rounded-[12px] bg-[rgb(38,83,141)] text-[16px] text-white"
              >
                <ShoppingCart className="h-3.5 w-3.5" />
                <span>В Корзину</span>
              </GlowButton>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
