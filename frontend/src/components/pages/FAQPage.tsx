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

        {/* Header */}
        <div className="max-w-4xl mx-auto text-center mb-16">
          <h1 className="text-5xl sm:text-6xl text-gray-900 mb-6">Часто задаваемые вопросы</h1>
          <p className="text-2xl text-gray-600">
            Ответы на популярные вопросы о работе платформы
          </p>
        </div>

        {/* FAQ List */}
        <div className="max-w-4xl mx-auto space-y-4">
          {faqData.map((item, index) => (
            <div
              key={index}
              className="bg-white border border-gray-200 rounded-xl overflow-hidden transition-all duration-300 hover:shadow-lg"
            >
              <button
                onClick={() => toggleQuestion(index)}
                className="w-full flex items-center justify-between p-6 text-left hover:bg-gray-50 transition-colors duration-200"
              >
                <span className="text-xl text-gray-900 pr-4">{item.question}</span>
                <ChevronDown
                  className={`w-6 h-6 text-gray-500 flex-shrink-0 transition-transform duration-300 ${
                    openIndex === index ? 'rotate-180' : ''
                  }`}
                />
              </button>
              
              <div
                className={`overflow-hidden transition-all duration-300 ${
                  openIndex === index ? 'max-h-96' : 'max-h-0'
                }`}
              >
                <div className="px-6 pb-6 text-lg text-gray-600 leading-relaxed">
                  {item.answer}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Contact CTA */}
        <div className="max-w-4xl mx-auto mt-16 bg-[rgb(0,0,0)] text-white rounded-2xl p-8 sm:p-12 text-center">
          <h2 className="text-3xl mb-4">Не нашли ответ на свой вопрос?</h2>
          <p className="text-xl text-gray-300 mb-6">
            Наша служба поддержки всегда готова помочь
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <a
              href="mailto:support@ecom.ru"
              className="px-8 py-4 bg-white text-gray-900 rounded-xl hover:bg-gray-100 transition-all duration-300 text-lg"
            >
              Напишите нам на почту: support@ecom.ru
            </a>
            <a
              href="tel:88001234567"
              className="px-8 py-4 border border-white text-white rounded-xl hover:bg-white/10 transition-all duration-300 text-lg"
            >
              или позвоните по номеру телефона: 8-800-123-45-67
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}