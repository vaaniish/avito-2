import React from 'react';
import { ArrowLeft } from 'lucide-react';

interface AboutPageProps {
  onBack: () => void;
}

export function AboutPage({ onBack }: AboutPageProps) {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-8 sm:py-16">
        {/* Back Button */}
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-8 text-lg transition-colors duration-300"
        >
          <ArrowLeft className="w-6 h-6" />
          Назад
        </button>

        {/* Content */}
        <div className="max-w-4xl mx-auto">
          <h1 className="text-5xl sm:text-6xl text-gray-900 mb-8">О нас</h1>
          
          <div className="space-y-8 text-gray-700">
            <div>
              <h2 className="text-3xl text-gray-900 mb-4">Наша миссия</h2>
              <p className="text-xl leading-relaxed">
                Ecom — это универсальная B2C площадка, которая объединяет качественные товары и услуги в одном месте. 
                Мы создали платформу, где покупатели находят всё необходимое, а проверенные продавцы получают доступ 
                к платёжеспособной аудитории.
              </p>
            </div>

            <div>
              <h2 className="text-3xl text-gray-900 mb-4">Наши принципы</h2>
              <div className="space-y-4">
                <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                  <h3 className="text-2xl text-gray-900 mb-2">Качество</h3>
                  <p className="text-lg text-gray-600">
                    Мы тщательно проверяем каждого продавца перед допуском на платформу. 
                    Только бренды, магазины и доверенные частные продавцы.
                  </p>
                </div>

                <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                  <h3 className="text-2xl text-gray-900 mb-2">Доверие</h3>
                  <p className="text-lg text-gray-600">
                    Система рейтингов, отзывов и верификации продавцов создаёт безопасную 
                    среду для покупок.
                  </p>
                </div>

                <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                  <h3 className="text-2xl text-gray-900 mb-2">Удобство</h3>
                  <p className="text-lg text-gray-600">
                    Минималистичный дизайн, умный поиск и интуитивная навигация — 
                    всё для вашего комфорта.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-3xl text-gray-900 mb-4">Почему выбирают нас</h2>
              <ul className="space-y-3 text-lg">
                <li className="flex items-start gap-3">
                  <span className="w-2 h-2 bg-gray-900 rounded-full mt-3 flex-shrink-0"></span>
                  <span>Широкий ассортимент товаров и услуг в одном месте</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-2 h-2 bg-gray-900 rounded-full mt-3 flex-shrink-0"></span>
                  <span>Проверенные продавцы с гарантией качества</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-2 h-2 bg-gray-900 rounded-full mt-3 flex-shrink-0"></span>
                  <span>Прозрачная система отзывов и рейтингов</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-2 h-2 bg-gray-900 rounded-full mt-3 flex-shrink-0"></span>
                  <span>Удобные способы оплаты и быстрая доставка</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-2 h-2 bg-gray-900 rounded-full mt-3 flex-shrink-0"></span>
                  <span>Поддержка покупателей 24/7</span>
                </li>
              </ul>
            </div>

            <div className="bg-[rgb(0,0,0)] text-white rounded-2xl p-8 sm:p-12">
              <h2 className="text-3xl mb-4">Присоединяйтесь к нам</h2>
              <p className="text-xl text-gray-300 mb-6">
                Станьте частью экосистемы, где качество встречается с удобством, 
                а доверие является основой каждой сделки.
              </p>
              <button className="px-8 py-4 bg-white text-gray-900 rounded-xl hover:bg-gray-100 transition-all duration-300 text-lg">
                Начать продавать
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}