import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface HeroProps {
  onBannerClick?: (category: string) => void;
}

const heroSlides = [
  {
    id: 1,
    image:
      "https://images.unsplash.com/photo-1748268263747-225c52414f81?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtb2Rlcm4lMjBzaG9wcGluZyUyMGJhbm5lcnxlbnwxfHx8fDE3NjYxOTU0NjR8MA&ixlib=rb-4.1.0&q=80&w=1080",
    title: "Зимняя распродажа",
    subtitle: "Скидки до 50% на все категории",
    cta: "Смотреть товары",
    category: "sale", // Special filter for sale items
  },
  {
    id: 2,
    image:
      "https://images.unsplash.com/photo-1707485122968-56916bd2c464?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx0ZWNoJTIwZ2FkZ2V0cyUyMGRpc3BsYXl8ZW58MXx8fHwxNzY2MTk1NDY1fDA&ixlib=rb-4.1.0&q=80&w=1080",
    title: "Новинки электроники",
    subtitle: "Самые свежие гаджеты уже в продаже",
    cta: "Открыть каталог",
    category: "Электроника",
  },
  {
    id: 3,
    image:
      "https://images.unsplash.com/photo-1621960144410-36da870e29b6?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxob21lJTIwZGVjb3IlMjBpbnRlcmlvcnxlbnwxfHx8fDE3NjYxMTU2Njl8MA&ixlib=rb-4.1.0&q=80&w=1080",
    title: "Дизайн вашего дома",
    subtitle: "Мебель премиум-класса от проверенных партнеров",
    cta: "Выбрать мебель",
    category: "Мебель",
  },
];

export function Hero({ onBannerClick: _onBannerClick }: HeroProps) {
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % heroSlides.length);
    }, 5000);

    return () => clearInterval(timer);
  }, []);

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % heroSlides.length);
  };

  const prevSlide = () => {
    setCurrentSlide(
      (prev) =>
        (prev - 1 + heroSlides.length) % heroSlides.length,
    );
  };

  return (
    <div className="w-full bg-[rgb(255,255,255)] pt-[0px] pr-[0px] pb-[0px] pl-[0px]">
      <div className="max-w-[1440px] mx-auto px-3 sm:px-6 py-3 sm:py-6">
        <div className="relative h-[350px] sm:h-[450px] lg:h-[600px] overflow-hidden rounded-xl sm:rounded-2xl">
          {/* Slides */}
          <div className="relative h-full">
            {heroSlides.map((slide, index) => (
              <div
                key={slide.id}
                className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
                  index === currentSlide
                    ? "opacity-100"
                    : "opacity-0"
                }`}
              >
                {/* Background Image */}
                <div
                  className="absolute inset-0 bg-cover bg-center"
                  style={{
                    backgroundImage: `url(${slide.image})`,
                  }}
                />

                {/* Gradient Overlay */}
                <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/60 to-black/40 sm:from-black/70 sm:via-black/50 sm:to-transparent" />
              </div>
            ))}
          </div>

          {/* Navigation Arrows */}
          <button
            onClick={prevSlide}
            className="absolute left-2 sm:left-4 lg:left-6 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-12 sm:h-12 lg:w-14 lg:h-14 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center hover:bg-white/30 transition-all duration-300"
          >
            <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6 lg:w-7 lg:h-7 text-white" />
          </button>
          <button
            onClick={nextSlide}
            className="absolute right-2 sm:right-4 lg:right-6 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-12 sm:h-12 lg:w-14 lg:h-14 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center hover:bg-white/30 transition-all duration-300"
          >
            <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6 lg:w-7 lg:h-7 text-white" />
          </button>

          {/* Slide Indicators */}
          <div className="absolute bottom-4 sm:bottom-6 lg:bottom-8 left-1/2 -translate-x-1/2 flex gap-2 sm:gap-3">
            {heroSlides.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentSlide(index)}
                className={`w-2 h-2 sm:w-3 sm:h-3 rounded-full transition-all duration-300 ${
                  index === currentSlide
                    ? "bg-white w-6 sm:w-10"
                    : "bg-white/50 hover:bg-white/75"
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
