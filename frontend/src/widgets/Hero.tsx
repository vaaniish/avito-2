import type { CSSProperties, MouseEvent, ReactNode, SVGProps } from "react";
import { useEffect, useState } from "react";
import { notifySuccess } from "../shared/ui/notifications";
import slide1 from "../assets/hero/final/slide-1.webp";
import slide2 from "../assets/hero/final/slide-2.webp";
import slide3 from "../assets/hero/final/slide-3.webp";
import slide4 from "../assets/hero/final/slide-4.webp";

interface HeroProps {
  onBannerClick?: (category: string) => void;
}

type SlideConfig = {
  id: "launch" | "gadgets" | "home" | "platform";
  category: string;
  background: string;
  cardStyle: CSSProperties;
  badge: string;
  title: ReactNode;
  description: string;
  highlights: string[];
  buttonLabel: string;
  icon: (props: SVGProps<SVGSVGElement>) => ReactNode;
  promoCode?: string;
};

function SparklesIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z" />
      <path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14Z" />
    </svg>
  );
}

function PhoneIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <rect x="7" y="3.5" width="10" height="17" rx="2.5" />
      <path d="M10 17.5h4" />
    </svg>
  );
}

function HomeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M4 11.5 12 5l8 6.5" />
      <path d="M6.5 10.5v8h11v-8" />
      <path d="M10 18.5v-5h4v5" />
    </svg>
  );
}

function ShieldIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M12 3.5 6.5 5.8v5.7c0 4.2 2.4 8 5.5 9.7 3.1-1.7 5.5-5.5 5.5-9.7V5.8L12 3.5Z" />
    </svg>
  );
}

const slides: SlideConfig[] = [
  {
    id: "launch",
    category: "",
    background: slide1,
    cardStyle: { left: "7.4%", top: "14.3%", width: "36.6%" },
    badge: "ОТКРЫТИЕ ECOMM",
    title: (
      <>
        15% первым
        <br />
        100 покупателям
      </>
    ),
    description: "Промокод на первый заказ для первых покупателей Ecomm.",
    highlights: ["первый заказ", "только 100 мест"],
    buttonLabel: "Каталог товаров",
    icon: SparklesIcon,
    promoCode: "START15",
  },
  {
    id: "gadgets",
    category: "Смартфоны и фототехника",
    background: slide2,
    cardStyle: { right: "8%", top: "16.2%", width: "35.8%" },
    badge: "ТЕХНИКА И ГАДЖЕТЫ",
    title: (
      <>
        Смартфоны,
        <br />
        наушники, аксессуары
      </>
    ),
    description: "Смартфоны, звук и аксессуары без лишнего поиска по всему каталогу.",
    highlights: ["смартфоны", "наушники", "аксессуары"],
    buttonLabel: "Смартфоны и фото",
    icon: PhoneIcon,
  },
  {
    id: "home",
    category: "Бытовая техника",
    background: slide3,
    cardStyle: { left: "7.5%", top: "16.2%", width: "35.4%" },
    badge: "ДОМ И КОМФОРТ",
    title: (
      <>
        Для кухни, дома
        <br />и комфорта
      </>
    ),
    description: "Кофемашины, уборка и техника для спокойного домашнего сценария.",
    highlights: ["кухня", "уборка", "ежедневный быт"],
    buttonLabel: "Бытовая техника",
    icon: HomeIcon,
  },
  {
    id: "platform",
    category: "ПК, ноутбуки, периферия",
    background: slide4,
    cardStyle: { left: "7.5%", top: "16.2%", width: "34.6%" },
    badge: "РАБОТА И УЧЁБА",
    title: (
      <>
        Ноутбук, периферия
        <br />и всё рядом
      </>
    ),
    description: "Подберите рабочее место: от ноутбука до мыши, клавиатуры и хаба.",
    highlights: ["ноутбуки", "периферия", "рабочее место"],
    buttonLabel: "ПК и ноутбуки",
    icon: ShieldIcon,
  },
];

function HeroNavButton({
  direction,
  onClick,
}: {
  direction: "prev" | "next";
  onClick: () => void;
}) {
  const isPrev = direction === "prev";

  return (
    <button
      type="button"
      aria-label={isPrev ? "Предыдущий баннер" : "Следующий баннер"}
      onClick={onClick}
      className={`group absolute top-0 z-40 flex h-full w-16 items-center transition ${
        isPrev ? "left-0 justify-start pl-4" : "right-0 justify-end pr-4"
      }`}
    >
      <span
        className="flex h-[42%] min-h-[148px] w-9 items-center justify-center rounded-full border border-slate-300/45 bg-slate-100/70 text-[32px] leading-none text-slate-700 shadow-[0_18px_42px_-28px_rgba(15,23,42,0.45)] backdrop-blur-md transition duration-300 group-hover:h-[54%] group-hover:bg-slate-200/82 group-hover:text-slate-950 group-active:scale-[0.98]"
        aria-hidden="true"
      >
        {isPrev ? "‹" : "›"}
      </span>
    </button>
  );
}

function HeroPromoCodeButton({ value }: { value: string }) {
  const copyValue = async () => {
    try {
      await navigator.clipboard.writeText(value);
      notifySuccess(`Промокод ${value} скопирован`);
    } catch (_error) {
      notifySuccess(`Промокод ${value}`);
    }
  };

  return (
    <button
      type="button"
      onClick={copyValue}
      className="group relative flex w-full items-center justify-between overflow-hidden border bg-[linear-gradient(135deg,#f7fbff_0%,#ffffff_38%,#edf5ff_100%)] px-4 py-3 text-left text-[15px] text-slate-700 shadow-[0_16px_28px_-22px_rgba(47,95,156,0.55)] transition duration-300 hover:-translate-y-0.5 hover:border-[#8eb7eb] hover:shadow-[0_22px_34px_-22px_rgba(47,95,156,0.78)] active:scale-[0.99]"
      style={{
        borderColor: "#b8d1f2",
        borderRadius: 22,
      }}
      aria-label={`Скопировать промокод ${value}`}
    >
      <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,transparent_18%,rgba(255,255,255,0.88)_38%,transparent_56%)] opacity-0 transition duration-500 group-hover:translate-x-[180%] group-hover:opacity-100 -translate-x-[180%]" />
      <span className="pointer-events-none absolute -right-1 -top-1 h-5 w-5 rounded-full bg-[#9bc4ff]/80 blur-[2px] transition duration-300 group-hover:scale-150 group-hover:opacity-100" />
      <span className="pointer-events-none absolute -bottom-1 left-4 h-4 w-4 rounded-full bg-[#d9ebff] blur-[1px] transition duration-300 group-hover:scale-125" />
      <span className="relative min-w-0 leading-tight">
        <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">промокод</span>
        <span className="block text-[20px] font-semibold tracking-[-0.03em] text-[#2f5f9c]">{value}</span>
      </span>
      <span className="relative ml-3 shrink-0 rounded-full border border-[#d8e6f8] bg-white/85 px-3 py-1.5 text-[13px] font-semibold text-[#2f5f9c]">
        Скопировать
      </span>
    </button>
  );
}

function HeroCard({
  slide,
  onClick,
}: {
  slide: SlideConfig;
  onClick: () => void;
}) {
  const Icon = slide.icon;
  const keepCardClickInside = (event: MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
  };

  return (
    <div
      className="absolute z-30 overflow-hidden px-8 py-8 text-slate-950"
      onClick={keepCardClickInside}
      style={{
        border: "1px solid rgba(221,231,244,0.98)",
        borderRadius: 36,
        background: "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(255,255,255,0.96))",
        boxShadow: "0 34px 70px -36px rgba(15, 23, 42, 0.38), inset 0 1px 0 rgba(255,255,255,0.92)",
        backdropFilter: "blur(6px)",
        ...slide.cardStyle,
      }}
    >
      <div className="mb-6 flex items-center gap-3">
        <div className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] bg-[#edf4ff] text-[#2f5f9c] shadow-[inset_0_1px_0_rgba(255,255,255,0.92)]">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-slate-400">{slide.badge}</div>
          <div className="mt-1 h-px w-16 bg-[#2f5f9c]/20" />
        </div>
      </div>

      <h2 className="max-w-[9.5em] text-[30px] font-semibold leading-[1.02] tracking-[-0.055em] text-slate-950">
        {slide.title}
      </h2>
      <p className="mt-4 max-w-[31ch] text-[15px] leading-6 text-slate-500">{slide.description}</p>

      <div className="mt-5 flex flex-wrap gap-2">
        {slide.highlights.map((highlight) => (
          <span
            key={highlight}
            className="rounded-full border border-[#dce6f4] bg-[#f7faff] px-3 py-1.5 text-[13px] font-medium text-slate-600"
          >
            {highlight}
          </span>
        ))}
      </div>

      {slide.promoCode ? (
        <div className="mt-6">
          <HeroPromoCodeButton value={slide.promoCode} />
        </div>
      ) : null}

      <div className="mt-6 flex items-center">
        <button
          type="button"
          onClick={onClick}
          className="inline-flex h-14 min-w-[178px] items-center justify-center gap-2 rounded-full px-6 text-[17px] font-medium text-white transition hover:-translate-y-0.5 active:scale-[0.98]"
          style={{ backgroundColor: "#2f5f9c", boxShadow: "0 14px 26px -18px rgba(47, 95, 156, 0.75)" }}
        >
          {slide.buttonLabel}
          <span aria-hidden="true">›</span>
        </button>
      </div>
    </div>
  );
}

export function Hero({ onBannerClick }: HeroProps) {
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 7000);

    return () => window.clearInterval(timer);
  }, []);

  const goPrev = () => setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length);
  const goNext = () => setCurrentSlide((prev) => (prev + 1) % slides.length);

  return (
    <section className="w-full bg-white">
      <div className="mx-auto max-w-[1440px] px-3 py-3 sm:px-6 sm:py-6">
        <div
          className="relative bg-[#f8fbff]"
          style={{
            border: "1px solid #dfe5ee",
            borderRadius: 48,
            boxShadow: "0 28px 72px -42px rgba(15, 23, 42, 0.38)",
            clipPath: "inset(0 round 48px)",
            overflow: "hidden",
            transform: "translateZ(0)",
          }}
        >
          <div
            className="relative w-full"
            style={{ minHeight: "414px", height: "clamp(414px, 46vw, 620px)" }}
          >
            {slides.map((slide, index) => (
              <div
                key={slide.id}
                className={`absolute inset-0 transition-opacity duration-500 ${
                  index === currentSlide ? "opacity-100" : "pointer-events-none opacity-0"
                }`}
              >
                <img
                  src={slide.background}
                  alt=""
                  aria-hidden="true"
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <HeroCard slide={slide} onClick={() => onBannerClick?.(slide.category)} />
              </div>
            ))}

            <button
              type="button"
              aria-label="Предыдущий баннер по левой половине"
              onClick={goPrev}
              className="absolute inset-y-0 left-0 z-10 cursor-w-resize bg-transparent"
              style={{ width: "50%" }}
            />
            <button
              type="button"
              aria-label="Следующий баннер по правой половине"
              onClick={goNext}
              className="absolute inset-y-0 right-0 z-10 cursor-e-resize bg-transparent"
              style={{ width: "50%" }}
            />

            <HeroNavButton direction="prev" onClick={goPrev} />
            <HeroNavButton direction="next" onClick={goNext} />

            <div className="absolute bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2.5 rounded-full bg-slate-950/16 px-3 py-2 shadow-[0_18px_36px_-24px_rgba(15,23,42,0.5)] backdrop-blur-md">
              {slides.map((slide, index) => (
                <button
                  key={slide.id}
                  type="button"
                  onClick={() => setCurrentSlide(index)}
                  className={`h-1.5 rounded-full shadow-[0_8px_18px_-12px_rgba(15,23,42,0.65)] transition-all duration-300 ${
                    index === currentSlide ? "w-16 bg-[#2f5f9c]" : "w-12 bg-white hover:bg-white"
                  }`}
                  aria-label={`Перейти к баннеру ${index + 1}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
