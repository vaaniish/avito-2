import { ExternalLink } from "lucide-react";

interface FooterProps {
  onNavigate?: (page: FooterPage) => void;
}

export type FooterPage =
  | "about"
  | "partnership"
  | "faq"
  | "privacy"
  | "terms";

export function Footer({ onNavigate }: FooterProps) {
  const handleNavigation = (page: FooterPage) => {
    if (onNavigate) {
      onNavigate(page);
    }
  };

  return (
    <footer className="backdrop-blur-lg text-white bg-[rgb(38,83,141)] rounded-none min-[1456px]:rounded-t-[100px] p-[0px]">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-12 sm:py-16 pt-[50px] pr-[21px] pb-[30px] pl-[21px]">
        {/* Desktop Layout - Shows at 770px and above */}
        <div className="hidden min-[770px]:block">
          {/* Top Section */}
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between pb-8 sm:pb-12 border-b border-white/10 gap-6 mx-[0px] my-[30px] mt-[0px] mr-[0px] mb-[30px] ml-[0px]">
            {/* Logo and Description */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
              <h3 className="text-2xl sm:text-3xl whitespace-nowrap">
                Ecomm
              </h3>
              <div className="hidden sm:block w-px h-8 sm:h-10 bg-white/20"></div>
              <p className="text-[rgb(255,255,255)] text-sm sm:text-base lg:text-lg">
                Универсальная B2C платформа для товаров и услуг
              </p>
            </div>

            {/* Navigation Links */}
            <nav className="flex flex-wrap gap-4 sm:gap-6 lg:gap-8 text-base sm:text-lg">
              <button
                onClick={() => handleNavigation("about")}
                className="text-[rgb(188,200,217)] hover:text-white transition-colors duration-300 whitespace-nowrap"
              >
                О нас
              </button>
              <button
                onClick={() => handleNavigation("partnership")}
                className="text-[rgb(188,200,217)] hover:text-white transition-colors duration-300 whitespace-nowrap"
              >
                Партнёрство
              </button>
              <button
                onClick={() => handleNavigation("faq")}
                className="text-[rgb(188,200,217)] hover:text-white transition-colors duration-300 whitespace-nowrap"
              >
                FAQ
              </button>
            </nav>
          </div>

          {/* Bottom Section */}
          <div className="flex flex-col gap-6">
            {/* Copyright and Legal Links */}
            <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-3 sm:gap-4 lg:gap-6 text-sm sm:text-base text-gray-400">
              {/* Copyright */}
              <span className="text-[rgb(188,200,217)] whitespace-nowrap">
                © 2025 Ecomm. Все права защищены
              </span>

              {/* Legal Links */}
              <button
                onClick={() => handleNavigation("privacy")}
                className="hover:text-white transition-colors duration-300 text-[rgb(188,200,217)] text-left"
              >
                Политика конфиденциальности
              </button>
              <button
                onClick={() => handleNavigation("terms")}
                className="hover:text-white transition-colors duration-300 text-[rgb(188,200,217)] text-left"
              >
                Правила использования
              </button>
            </div>

            {/* Social Media Links */}
            <div className="flex flex-wrap gap-4 sm:gap-6 items-center">
              <a
                href="https://vk.com/ecomm"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 sm:gap-2 text-gray-400 hover:text-white transition-colors duration-300"
              >
                <span className="text-sm sm:text-base whitespace-nowrap">
                  Вконтакте
                </span>
                <ExternalLink className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
              </a>
              <a
                href="https://t.me/ecomm"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 sm:gap-2 text-gray-400 hover:text-white transition-colors duration-300"
              >
                <span className="text-sm sm:text-base whitespace-nowrap">
                  Телеграм
                </span>
                <ExternalLink className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
              </a>
              <a
                href="https://lanit.ru"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 sm:gap-2 text-gray-400 hover:text-white transition-colors duration-300"
              >
                <span className="text-sm sm:text-base whitespace-nowrap">
                  ГК Ланит
                </span>
                <ExternalLink className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
              </a>
            </div>
          </div>
        </div>

        {/* Mobile Layout - Centered - Shows below 770px */}
        <div className="max-[769px]:flex hidden flex-col items-center text-center space-y-6 px-4">
          {/* Logo */}
          <h3 className="text-2xl">Ecomm</h3>

          {/* Divider */}
          <div className="w-16 h-px bg-white/20"></div>

          {/* Description */}
          <p className="text-gray-400 text-sm sm:text-base max-w-xs px-4">
            Универсальная B2C платформа для товаров и услуг
          </p>

          {/* Navigation Links */}
          <nav className="flex flex-col gap-4 text-base w-full">
            <button
              onClick={() => handleNavigation("about")}
              className="text-gray-400 hover:text-white transition-colors duration-300"
            >
              О нас
            </button>
            <button
              onClick={() => handleNavigation("partnership")}
              className="text-gray-400 hover:text-white transition-colors duration-300"
            >
              Партнёрство
            </button>
            <button
              onClick={() => handleNavigation("faq")}
              className="text-gray-400 hover:text-white transition-colors duration-300"
            >
              FAQ
            </button>
          </nav>

          {/* Social Media Links */}
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <a
              href="https://vk.com/ecomm"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors duration-300 text-sm"
            >
              <span className="whitespace-nowrap">
                Вконтакте
              </span>
              <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
            </a>
            <a
              href="https://t.me/ecomm"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors duration-300 text-sm"
            >
              <span className="whitespace-nowrap">
                Телеграм
              </span>
              <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
            </a>
            <a
              href="https://lanit.ru"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors duration-300 text-sm"
            >
              <span className="whitespace-nowrap">
                ГК Ланит
              </span>
              <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
            </a>
          </div>

          {/* Legal Links */}
          <div className="flex flex-col gap-3 text-xs sm:text-sm text-gray-400 pt-4 w-full px-2">
            <button
              onClick={() => handleNavigation("privacy")}
              className="hover:text-white transition-colors duration-300"
            >
              Политика конфиденциальности
            </button>
            <button
              onClick={() => handleNavigation("terms")}
              className="hover:text-white transition-colors duration-300"
            >
              Правила использования
            </button>
          </div>

          {/* Copyright */}
          <p className="text-xs sm:text-sm text-gray-400 pt-2">
            © 2025 Ecomm. Все права защищены
          </p>
        </div>
      </div>
    </footer>
  );
}
