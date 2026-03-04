import React from 'react';
import { ArrowLeft } from 'lucide-react';

interface AboutPageProps {
  onBack: () => void;
}

export function AboutPage({ onBack }: AboutPageProps) {
  return (
    <div className="min-h-screen app-shell">
      <div className="page-container pb-12 pt-[calc(var(--header-height,84px)+1.1rem)] sm:pb-16">
        <button
          onClick={onBack}
          className="back-link mb-7 text-sm sm:text-base"
        >
          <ArrowLeft className="h-5 w-5" />
          Назад
        </button>

        <div className="content-page">
          <h1 className="mb-6 text-slate-900">О нас</h1>
          
          <div className="space-y-8">
            <div>
              <h2 className="mb-3 text-slate-900">Наша миссия</h2>
              <p>
                Ecom — это универсальная B2C площадка, которая объединяет качественные товары и услуги в одном месте. 
                Мы создали платформу, где покупатели находят всё необходимое, а проверенные продавцы получают доступ 
                к платёжеспособной аудитории.
              </p>
            </div>

            <div>
              <h2 className="mb-3 text-slate-900">Наши принципы</h2>
              <div className="space-y-4">
                <div className="surface-card p-5">
                  <h3 className="mb-2 text-xl font-semibold text-gray-900">Качество</h3>
                  <p>
                    Мы тщательно проверяем каждого продавца перед допуском на платформу. 
                    Только бренды, магазины и доверенные частные продавцы.
                  </p>
                </div>

                <div className="surface-card p-5">
                  <h3 className="mb-2 text-xl font-semibold text-gray-900">Доверие</h3>
                  <p>
                    Система рейтингов, отзывов и верификации продавцов создаёт безопасную 
                    среду для покупок.
                  </p>
                </div>

                <div className="surface-card p-5">
                  <h3 className="mb-2 text-xl font-semibold text-gray-900">Удобство</h3>
                  <p>
                    Минималистичный дизайн, умный поиск и интуитивная навигация — 
                    всё для вашего комфорта.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <h2 className="mb-3 text-slate-900">Почему выбирают нас</h2>
              <ul className="space-y-3">
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

            <div className="rounded-2xl bg-[rgb(15,30,53)] p-6 text-white sm:p-10">
              <h2 className="mb-3 text-2xl font-semibold sm:text-3xl">Присоединяйтесь к нам</h2>
              <p className="mb-6 text-sm text-blue-100 sm:text-lg">
                Станьте частью экосистемы, где качество встречается с удобством, 
                а доверие является основой каждой сделки.
              </p>
              <button className="btn-secondary px-6 py-3 text-sm font-semibold sm:text-base">
                Начать продавать
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
