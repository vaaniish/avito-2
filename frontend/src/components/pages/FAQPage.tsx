import React, { useState } from 'react';
import { ArrowLeft, ChevronDown } from 'lucide-react';

interface FAQPageProps {
  onBack: () => void;
}

interface FAQItem {
  question: string;
  answer: string;
}

const faqData: FAQItem[] = [
  {
    question: 'Как сделать заказ?',
    answer: 'Выберите нужный товар, нажмите "В корзину", перейдите в корзину и оформите заказ. Укажите данные для доставки, выберите способ оплаты и подтвердите заказ. Вы получите уведомление на email с деталями заказа и номером отслеживания.'
  },
  {
    question: 'Доставка и оплата',
    answer: 'Мы работаем с несколькими службами доставки: СДЭК, Почта России, курьерские службы. Стоимость доставки рассчитывается автоматически при оформлении заказа. Оплата возможна картой онлайн, наличными курьеру или при получении в пункте выдачи. Доставка по Москве — 1-2 дня, по России — 3-7 дней.'
  },
  {
    question: 'Возврат товара',
    answer: 'Вы можете вернуть товар в течение 14 дней с момента получения без объяснения причин. Товар должен быть в оригинальной упаковке, с бирками и без следов использования. Для оформления возврата свяжитесь с нашей службой поддержки через раздел "Мои заказы". Деньги вернутся на ваш счёт в течение 7-10 рабочих дней.'
  },
  {
    question: 'Как отследить мой заказ?',
    answer: 'После отправки заказа вы получите трек-номер на email. С его помощью можно отследить посылку на сайте транспортной компании. Также статус заказа отображается в личном кабинете в разделе "Мои заказы". Мы отправляем уведомления о каждом изменении статуса.'
  },
  {
    question: 'Можно ли изменить или отменить заказ?',
    answer: 'Да, вы можете отменить или изменить заказ до момента его отправки. Для этого свяжитесь со службой поддержки как можно скорее. После отправки изменения невозможны, но вы можете оформить возврат после получения товара.'
  },
  {
    question: 'Как стать продавцом на платформе?',
    answer: 'Перейдите в раздел "Партнёрство" и заполните форму заявки. Мы проверяем каждого продавца вручную — это занимает 2-3 рабочих дня. После одобрения вы получите доступ к личному кабинету продавца, где сможете добавлять товары и управлять заказами.'
  },
  {
    question: 'Безопасны ли мои данные?',
    answer: 'Мы используем современные протоколы шифрования для защиты ваших данных. Платёжная информация обрабатывается через защищённые платёжные шлюзы и не хранится на наших серверах. Мы соблюдаем требования закона о персональных данных и не передаём вашу информацию третьим лицам.'
  },
  {
    question: 'Что делать, если товар пришёл повреждённым?',
    answer: 'Сфотографируйте повреждения и упаковку, свяжитесь со службой поддержки в течение 24 часов. Мы организуем возврат за наш счёт и отправим замену или вернём деньги. Не выбрасывайте упаковку до решения вопроса — она понадобится для возврата.'
  },
  {
    question: 'Есть ли программа лояльности?',
    answer: 'Да! За каждую покупку вы получаете баллы (1% от суммы заказа), которые можно использовать для оплаты следующих покупок. Также мы регулярно проводим акции и распродажи. Подпишитесь на нашу рассылку, чтобы первыми узнавать о специальных предложениях.'
  },
  {
    question: 'Как связаться со службой поддержки?',
    answer: 'Мы работаем для вас 24/7. Напишите нам на email support@ecom.ru, через чат на сайте или позвоните по телефону 8-800-123-45-67 (звонок бесплатный). Среднее время ответа — 15 минут. Для быстрого решения вопроса укажите номер заказа.'
  }
];

export function FAQPage({ onBack }: FAQPageProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggleQuestion = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

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

        <div className="content-page mb-10 text-center sm:mb-12">
          <h1 className="mb-4 text-slate-900">Часто задаваемые вопросы</h1>
          <p className="text-base text-slate-600 sm:text-xl">
            Ответы на популярные вопросы о работе платформы
          </p>
        </div>

        <div className="content-page space-y-3">
          {faqData.map((item, index) => (
            <div
              key={index}
              className="surface-card overflow-hidden transition-all duration-300"
            >
              <button
                onClick={() => toggleQuestion(index)}
                className="flex w-full items-center justify-between p-4 text-left transition-colors duration-200 hover:bg-slate-50 sm:p-5"
              >
                <span className="pr-3 text-base font-semibold text-slate-900 sm:text-lg">{item.question}</span>
                <ChevronDown
                  className={`h-5 w-5 flex-shrink-0 text-gray-500 transition-transform duration-300 sm:h-6 sm:w-6 ${
                    openIndex === index ? 'rotate-180' : ''
                  }`}
                />
              </button>
              
              <div
                className={`overflow-hidden transition-all duration-300 ${
                  openIndex === index ? 'max-h-96' : 'max-h-0'
                }`}
              >
                <div className="px-4 pb-4 text-sm leading-relaxed text-gray-600 sm:px-5 sm:pb-5 sm:text-base">
                  {item.answer}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="content-page mt-10 rounded-2xl bg-[rgb(15,30,53)] p-6 text-center text-white sm:mt-12 sm:p-10">
          <h2 className="mb-3 text-2xl font-semibold sm:text-3xl">Не нашли ответ на свой вопрос?</h2>
          <p className="mb-6 text-sm text-blue-100 sm:text-lg">
            Наша служба поддержки всегда готова помочь
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <a
              href="mailto:support@ecom.ru"
              className="btn-secondary px-5 py-3 text-sm font-semibold sm:text-base"
            >
              Напишите нам на почту: support@ecom.ru
            </a>
            <a
              href="tel:88001234567"
              className="rounded-xl border border-white/40 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10 sm:text-base"
            >
              или позвоните по номеру телефона: 8-800-123-45-67
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
