import React, { useState } from "react";
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
}

export function ProductCard({
  product,
  onClick,
  onAddToCart,
  onUpdateQuantity,
  cartQuantity = 0,
  viewMode,
  displayMode = "grid",
}: ProductCardProps) {
  const [isWishlisted, setIsWishlisted] = useState(false);

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
    setIsWishlisted((s) => !s);
  };

  const displayPrice =
    product.isSale && product.salePrice
      ? product.salePrice
      : product.price;

  const discountPercent =
    product.isSale && product.salePrice
      ? Math.round(
          ((product.price - product.salePrice) /
            product.price) *
            100,
        )
      : 0;

  const city = product.city || "Не указан";
  const reviewsCount = product.reviews?.length ?? 0;

  // === LIST VIEW ===
  if (displayMode === "list") {
    return (
      <div
        onClick={onClick}
        className="group relative bg-white rounded-xl overflow-hidden cursor-pointer transition-shadow duration-200 hover:shadow-lg border border-gray-200 p-4"
      >
        <div className="flex gap-4 items-start">
          <div className="relative w-[220px] h-[220px] flex-shrink-0 overflow-hidden bg-gray-50 rounded-xl border border-gray-200">
            <img
              src={product.image}
              alt={product.title}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <button
              onClick={handleWishlist}
              className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/95 flex items-center justify-center shadow-sm"
              aria-label="wishlist"
            >
              <Heart
                className={`w-4 h-4 ${
                  isWishlisted
                    ? "fill-red-500 text-red-500"
                    : "text-gray-600"
                }`}
              />
            </button>
          </div>

          <div className="flex-1 max-w-[500px] flex flex-col">
            <h3 className="text-[18px] font-medium text-black line-clamp-1 leading-tight">
              {product.title}
            </h3>

            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-[24px] font-bold text-black">
                {displayPrice.toLocaleString("ru-RU")} ₽
              </span>

              {product.isSale &&
                product.salePrice &&
                discountPercent > 0 && (
                  <>
                    <span className="text-[13px] text-gray-400 line-through">
                      {product.price.toLocaleString("ru-RU")} ₽
                    </span>
                    <span className="text-[13px] text-red-500 font-medium">
                      -{discountPercent}%
                    </span>
                  </>
                )}
            </div>

            <div className="mt-3 flex items-center gap-2 text-[13px] text-[rgb(68,68,68)]">
              <span>{product.seller}</span>
              <span className="text-gray-300">·</span>
              <div className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                <span>{city}</span>
              </div>
            </div>

            <p className="mt-2 text-[14px] text-[#888888] line-clamp-2">
              {product.title}. Высокое качество, быстрая
              доставка. Гарантия производителя.
            </p>

            <div className="mt-3 flex items-center gap-2 text-[rgb(68,68,68)]">
              <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
              <span className="text-[14px]">
                {product.rating}
              </span>
              <span className="text-[14px]">
                ({reviewsCount} отзывов)
              </span>
            </div>
          </div>

          <div className="flex-shrink-0 w-[180px] ml-auto">
            {/* FIXED CTA HEIGHT to avoid layout shifts */}
            <div className="h-11">
              {cartQuantity > 0 ? (
                <div className="h-full w-full flex items-center justify-between gap-2 bg-black rounded-xl px-2">
                  <button
                    onClick={handleDecrement}
                    className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-gray-800 transition-colors duration-200"
                    aria-label="decrement"
                  >
                    <Minus className="w-4 h-4 text-white" />
                  </button>
                  <span className="text-white text-sm px-2">
                    {cartQuantity}
                  </span>
                  <button
                    onClick={handleIncrement}
                    className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-gray-800 transition-colors duration-200"
                    aria-label="increment"
                  >
                    <Plus className="w-4 h-4 text-white" />
                  </button>
                </div>
              ) : (
                <GlowButton
                  onClick={handleAddToCart}
                  className="relative h-full w-full rounded-xl overflow-hidden bg-[rgb(38,83,141)] text-white flex items-center justify-center gap-1.5 text-[15px]"
                >
                  <ShoppingCart className="w-4 h-4 relative z-10" />
                  <span className="relative z-10">
                    В Корзину
                  </span>
                </GlowButton>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // === GRID VIEW ===
  return (
    <div
      onClick={onClick}
      className="group relative bg-white rounded-xl overflow-hidden cursor-pointer transition-shadow duration-200 hover:shadow-lg border border-gray-200"
    >
      <div className="relative aspect-square overflow-hidden bg-gray-50">
        <img
          src={product.image}
          alt={product.title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute top-2 right-2">
          <button
            onClick={handleWishlist}
            className="w-8 h-8 rounded-full bg-white/95 flex items-center justify-center shadow-sm"
            aria-label="wishlist"
          >
            <Heart
              className={`w-4 h-4 ${
                isWishlisted
                  ? "fill-red-500 text-red-500"
                  : "text-gray-600"
              }`}
            />
          </button>
        </div>
      </div>

      <div className="flex flex-col p-2">
        <h3 className="text-[17px] font-semibold text-black line-clamp-2 h-14">
          {product.title}
        </h3>

        <div className="flex-grow" />

        <div className="mt-2">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[22px] font-bold text-black">
              {displayPrice.toLocaleString("ru-RU")} ₽
            </span>
            {product.isSale &&
              product.salePrice &&
              discountPercent > 0 && (
                <>
                  <span className="text-xs text-gray-400 line-through">
                    {product.price.toLocaleString("ru-RU")} ₽
                  </span>
                  <span className="text-xs text-red-500">
                    -{discountPercent}%
                  </span>
                </>
              )}
          </div>

          <div className="mt-1 flex items-center gap-1 text-[13px] text-[rgb(68,68,68)]">
            <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
            <span>{product.rating}</span>
            <span>({reviewsCount} отзывов)</span>
          </div>

          <div className="text-[12px] text-[rgb(68,68,68)] mt-1">
            {product.seller}
          </div>

          <div className="flex items-center gap-1 text-[12px] text-[rgb(119,119,119)] mt-1 mb-2">
            <MapPin className="w-3.5 h-3.5" />
            <span>{city}</span>
          </div>

          {/* FIXED CTA HEIGHT */}
          <div className="h-11">
            {cartQuantity > 0 ? (
              <div className="h-full w-full flex items-center justify-between gap-2 bg-[rgb(38,83,141)] rounded-[12px] px-2">
                <button
                  onClick={handleDecrement}
                  className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-[rgba(255,255,255,0.2)] transition-colors duration-200"
                  aria-label="decrement"
                >
                  <Minus className="w-3.5 h-3.5 text-white" />
                </button>
                <span className="text-white text-[16px] text-center min-w-[2rem]">
                  В корзине: {cartQuantity}
                </span>
                <button
                  onClick={handleIncrement}
                  className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-[rgba(255,255,255,0.2)] transition-colors duration-200"
                  aria-label="increment"
                >
                  <Plus className="w-3.5 h-3.5 text-white" />
                </button>
              </div>
            ) : (
              <GlowButton
                onClick={handleAddToCart}
                className="h-full w-full rounded-[12px] bg-[rgb(38,83,141)] text-white text-[16px]"
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                <span>В Корзину</span>
              </GlowButton>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
