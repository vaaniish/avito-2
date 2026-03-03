import React from 'react';
import { ArrowLeft } from 'lucide-react';

interface TermsPageProps {
  onBack: () => void;
}

export function TermsPage({ onBack }: TermsPageProps) {
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
          <h1 className="text-5xl sm:text-6xl text-gray-900 mb-6">Правила использования</h1>
          <p className="text-xl text-gray-600 mb-12">Обновлено: 20 декабря 2025</p>

          <div className="space-y-10 text-gray-700">
            {/* Section 1 */}
            <section>
              <h2 className="text-3xl text-gray-900 mb-4">1. Общие условия</h2>
              <div className="space-y-4 text-lg leading-relaxed">
                <p>
                  Настоящие Правила использования (далее — «Правила») регулируют порядок использования платформы 
                  Ecom (далее — «Платформа») и применяются ко всем пользователям без исключения.
                </p>
                <p>
                  Регистрируясь на Платформе или используя её услуги, вы подтверждаете, что прочитали, поняли и 
                  согласны с данными Правилами.
                </p>
                <p>
                  Если вы не согласны с какими-либо положениями Правил, пожалуйста, не используйте Платформу.
                </p>
              </div>
            </section>

            {/* Section 2 */}
            <section>
              <h2 className="text-3xl text-gray-900 mb-4">2. Регистрация и аккаунт</h2>
              <div className="space-y-4 text-lg leading-relaxed">
                <p>Для использования функций Платформы необходимо создать аккаунт. При регистрации вы обязуетесь:</p>
                <ul className="space-y-2 list-disc list-inside ml-4">
                  <li>Предоставлять достоверную и актуальную информацию</li>
                  <li>Поддерживать безопасность пароля и не передавать его третьим лицам</li>
                  <li>Немедленно уведомлять нас о любом несанкционированном доступе</li>
                  <li>Использовать один аккаунт на одного человека или организацию</li>
                  <li>Достичь возраста 18 лет или иметь согласие родителей/опекунов</li>
                </ul>
                <p>
                  Мы оставляем за собой право заблокировать или удалить аккаунт при нарушении Правил.
                </p>
              </div>
            </section>

            {/* Section 3 */}
            <section>
              <h2 className="text-3xl text-gray-900 mb-4">3. Покупки и оплата</h2>
              <div className="space-y-4 text-lg leading-relaxed">
                <p>При совершении покупок на Платформе действуют следующие условия:</p>
                
                <div className="bg-gray-50 rounded-xl p-6 border border-gray-200 space-y-3">
                  <p><strong>Оформление заказа:</strong></p>
                  <ul className="space-y-2 list-disc list-inside ml-4 text-gray-700">
                    <li>Все цены указаны в рублях и включают НДС</li>
                    <li>Стоимость доставки рассчитывается отдельно при оформлении</li>
                    <li>Заказ считается оформленным после получения подтверждения по email</li>
                    <li>Мы оставляем за собой право отменить заказ при отсутствии товара</li>
                  </ul>
                </div>

                <div className="bg-gray-50 rounded-xl p-6 border border-gray-200 space-y-3">
                  <p><strong>Оплата:</strong></p>
                  <ul className="space-y-2 list-disc list-inside ml-4 text-gray-700">
                    <li>Доступны способы: банковские карты, электронные кошельки, наличные при получении</li>
                    <li>Оплата обрабатывается через защищённые платёжные шлюзы</li>
                    <li>При неоплате в течение 24 часов заказ аннулируется</li>
                    <li>Возврат средств осуществляется тем же способом, что и оплата</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Section 4 */}
            <section>
              <h2 className="text-3xl text-gray-900 mb-4">4. Доставка</h2>
              <div className="space-y-4 text-lg leading-relaxed">
                <p>Условия доставки:</p>
                <ul className="space-y-2 list-disc list-inside ml-4">
                  <li>Сроки доставки указаны приблизительно и зависят от региона и транспортной компании</li>
                  <li>Доставка по Москве: 1-2 рабочих дня, по России: 3-7 рабочих дней</li>
                  <li>При получении проверьте товар на наличие повреждений в присутствии курьера</li>
                  <li>Если вы не забрали заказ из пункта выдачи в течение 5 дней, он возвращается продавцу</li>
                  <li>Стоимость обратной доставки из-за невыкупа оплачивает покупатель</li>
                </ul>
              </div>
            </section>

            {/* Section 5 */}
            <section>
              <h2 className="text-3xl text-gray-900 mb-4">5. Возврат и обмен</h2>
              <div className="space-y-4 text-lg leading-relaxed">
                <p>Вы можете вернуть или обменять товар в следующих случаях:</p>
                
                <div className="bg-gray-50 rounded-xl p-6 border border-gray-200 space-y-3">
                  <p><strong>Стандартный возврат (14 дней):</strong></p>
                  <ul className="space-y-2 list-disc list-inside ml-4 text-gray-700">
                    <li>Товар надлежащего качества можно вернуть без объяснения причин</li>
                    <li>Товар должен быть в оригинальной упаковке, с бирками, без следов использования</li>
                    <li>Деньги возвращаются в течние 10 рабочих дней после получения товара</li>
                    <li>Стоимость обратной доставки оплачивает покупатель</li>
                  </ul>
                </div>

                <div className="bg-gray-50 rounded-xl p-6 border border-gray-200 space-y-3">
                  <p><strong>Возврат бракованного товара:</strong></p>
                  <ul className="space-y-2 list-disc list-inside ml-4 text-gray-700">
                    <li>Срок возврата — в течение гарантийного периода</li>
                    <li>Необходимо предоставить фото дефекта</li>
                    <li>Обратная доставка за наш счёт</li>
                    <li>Возможен возврат денег, обмен или ремонт на выбор покупателя</li>
                  </ul>
                </div>

                <p>
                  <strong>Невозвратные товары:</strong> товары личной гигиены, нижнее бельё, продукты питания, 
                  цифровой контент после активации.
                </p>
              </div>
            </section>

            {/* Section 6 */}
            <section>
              <h2 className="text-3xl text-gray-900 mb-4">6. Правила для покупателей</h2>
              <div className="space-y-4 text-lg leading-relaxed">
                <p>Используя Платформу в качестве покупателя, вы обязуетесь:</p>
                <ul className="space-y-2 list-disc list-inside ml-4">
                  <li>Не размещать ложные отзывы или рейтинги</li>
                  <li>Не использовать Платформу для незаконной деятельности</li>
                  <li>Не злоупотреблять правом на возврат товара</li>
                  <li>Общаться с продавцами и службой поддержки уважительно</li>
                  <li>Не публиковать оскорбительный, дискриминационный или незаконный контент</li>
                  <li>Своевременно оплачивать и получать заказы</li>
                </ul>
              </div>
            </section>

            {/* Section 7 */}
            <section>
              <h2 className="text-3xl text-gray-900 mb-4">7. Правила для продавцов</h2>
              <div className="space-y-4 text-lg leading-relaxed">
                <p>Продавцы на Платформе обязуются:</p>
                <ul className="space-y-2 list-disc list-inside ml-4">
                  <li>Предоставлять точное описание товаров и услуг</li>
                  <li>Использовать только собственные фотографии или изображения с правами</li>
                  <li>Отправлять заказы в указанные сроки</li>
                  <li>Соблюдать законодательство о защите прав потребителей</li>
                  <li>Не продавать контрафактные, запрещённые или опасные товары</li>
                  <li>Отвечать на запросы покупателей в течение 24 часов</li>
                  <li>Платить комиссию Платформы согласно тарифам</li>
                </ul>
                <p>
                  За нарушение правил продавец может быть временно или навсегда заблокирован.
                </p>
              </div>
            </section>

            {/* Section 8 */}
            <section>
              <h2 className="text-3xl text-gray-900 mb-4">8. Интеллектуальная собственность</h2>
              <div className="space-y-4 text-lg leading-relaxed">
                <p>
                  Все материалы Платформы (тексты, изображения, логотипы, дизайн, код) защищены авторским правом 
                  и принадлежат Ecom или её партнёрам.
                </p>
                <p>Запрещается:</p>
                <ul className="space-y-2 list-disc list-inside ml-4">
                  <li>Копировать, распространять или модифицировать материалы без разрешения</li>
                  <li>Использовать логотипы и товарные знаки Ecom в коммерческих целях</li>
                  <li>Парсить данные Платформы автоматизированными средствами</li>
                  <li>Создавать производные работы на основе дизайна Платформы</li>
                </ul>
              </div>
            </section>

            {/* Section 9 */}
            <section>
              <h2 className="text-3xl text-gray-900 mb-4">9. Ограничение ответственности</h2>
              <div className="space-y-4 text-lg leading-relaxed">
                <p>
                  Платформа является посредником между покупателями и продавцами. Мы прилагаем усилия для проверки 
                  продавцов, но не несём ответственности за:
                </p>
                <ul className="space-y-2 list-disc list-inside ml-4">
                  <li>Качество, безопасность и соответствие товаров описанию</li>
                  <li>Действия или бездействие продавцов и служб доставки</li>
                  <li>Убытки, возникшие в результате использования товаров</li>
                  <li>Технические сбои, потерю данных или перерывы в работе</li>
                  <li>Действия третьих лиц, включая хакерские атаки</li>
                </ul>
                <p>
                  Наша ответственность ограничена суммой вашей последней покупки на Платформе.
                </p>
              </div>
            </section>

            {/* Section 10 */}
            <section>
              <h2 className="text-3xl text-gray-900 mb-4">10. Изменения в Правилах</h2>
              <div className="space-y-4 text-lg leading-relaxed">
                <p>
                  Мы оставляем за собой право изменять Правила в любое время. Существенные изменения вступают в силу 
                  через 7 дней после публикации на сайте.
                </p>
                <p>
                  Продолжая использовать Платформу после изменений, вы соглашаетесь с новой редакцией Правил.
                </p>
              </div>
            </section>

            {/* Section 11 */}
            <section>
              <h2 className="text-3xl text-gray-900 mb-4">11. Разрешение споров</h2>
              <div className="space-y-4 text-lg leading-relaxed">
                <p>
                  В случае возникновеия споров между пользователями или между пользователем и Платформой, стороны 
                  обязуются в первую очередь попытаться урегулировать спор путём переговоров.
                </p>
                <p>
                  Если спор не может быть решён мирным путём, он подлежит рассмотрению в суде по месту нахождения 
                  Платформы в соответствии с законодательством Российской Федерации.
                </p>
              </div>
            </section>

            {/* Section 12 */}
            <section>
              <h2 className="text-3xl text-gray-900 mb-4">12. Контакты</h2>
              <div className="space-y-4 text-lg leading-relaxed">
                <p>
                  По вопросам, связанным с Правилами использования, свяжитесь с нами:
                </p>
                <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                  <p><strong>Email:</strong> legal@ecom.ru</p>
                  <p><strong>Телефон:</strong> 8-800-123-45-67</p>
                  <p><strong>Адрес:</strong> г. Москва, ул. Примерная, д. 1</p>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}