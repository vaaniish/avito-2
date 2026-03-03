import React from 'react';
import { ArrowLeft } from 'lucide-react';

interface PrivacyPageProps {
  onBack: () => void;
}

export function PrivacyPage({ onBack }: PrivacyPageProps) {
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
          <h1 className="text-5xl sm:text-6xl text-gray-900 mb-6">Политика конфиденциальности</h1>
          <p className="text-xl text-gray-600 mb-12">Обновлено: 20 декабря 2025</p>

          <div className="space-y-10 text-gray-700">
            {/* Section 1 */}
            <section>
              <h2 className="text-3xl text-gray-900 mb-4">1. Общие положения</h2>
              <div className="space-y-4 text-lg leading-relaxed">
                <p>
                  Настоящая Политика конфиденциальности (далее — «Политика») определяет порядок обработки и защиты 
                  персональных данных пользователей платформы Ecom (далее — «Платформа»).
                </p>
                <p>
                  Используя Платформу, вы соглашаетесь с условиями данной Политики. Если вы не согласны с какими-либо 
                  положениями, пожалуйста, не используйте наши услуги.
                </p>
                <p>
                  Мы серьёзно относимся к защите ваших персональных данных и соблюдаем требования Федерального закона 
                  №152-ФЗ «О персональных данных» и GDPR.
                </p>
              </div>
            </section>

            {/* Section 2 */}
            <section>
              <h2 className="text-3xl text-gray-900 mb-4">2. Какие данные мы собираем</h2>
              <div className="space-y-4 text-lg leading-relaxed">
                <p>Мы собираем следующие категории персональных данных:</p>
                
                <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                  <h3 className="text-xl text-gray-900 mb-3">Данные, предоставленные вами:</h3>
                  <ul className="space-y-2 list-disc list-inside text-gray-700">
                    <li>ФИО, email, номер телефона при регистрации</li>
                    <li>Адрес доставки и платёжная информация при оформлении заказа</li>
                    <li>Отзывы, комментарии и рейтинги товаров</li>
                    <li>Данные из формы обратной связи</li>
                  </ul>
                </div>

                <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                  <h3 className="text-xl text-gray-900 mb-3">Данные, собираемые автоматически:</h3>
                  <ul className="space-y-2 list-disc list-inside text-gray-700">
                    <li>IP-адрес, тип браузера и устройства</li>
                    <li>Cookies и данные о действиях на сайте</li>
                    <li>История просмотров и покупок</li>
                    <li>Геолокация (с вашего согласия)</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Section 3 */}
            <section>
              <h2 className="text-3xl text-gray-900 mb-4">3. Как мы используем ваши данные</h2>
              <div className="space-y-3 text-lg leading-relaxed">
                <p>Мы используем собранные данные для:</p>
                <ul className="space-y-2 list-disc list-inside ml-4">
                  <li>Обработки и доставки заказов</li>
                  <li>Связи с вами по вопросам заказа или поддержки</li>
                  <li>Персонализации рекомендаций и улучшения сервиса</li>
                  <li>Анализа поведения пользователей для оптимизации Платформы</li>
                  <li>Рассылки новостей и специальных предложений (с вашего согласия)</li>
                  <li>Предотвращения мошенничества и обеспечения безопасности</li>
                  <li>Соблюдения законодательных требований</li>
                </ul>
              </div>
            </section>

            {/* Section 4 */}
            <section>
              <h2 className="text-3xl text-gray-900 mb-4">4. Передача данных третьим лицам</h2>
              <div className="space-y-4 text-lg leading-relaxed">
                <p>
                  Мы не продаём и не передаём ваши персональные данные третьим лицам, за исключением следующих случаев:
                </p>
                <ul className="space-y-2 list-disc list-inside ml-4">
                  <li><strong>Службы доставки</strong> — для организации доставки заказов (только адрес и контакты)</li>
                  <li><strong>Платёжные системы</strong> — для обработки платежей (через защищённые каналы)</li>
                  <li><strong>Партнёры-продавцы</strong> — для выполнения заказов (только необходимые данные)</li>
                  <li><strong>Государственные органы</strong> — при наличии законных оснований</li>
                </ul>
                <p>
                  Все наши партнёры обязаны соблюдать конфиденциальность и использовать данные только для оговорённых целей.
                </p>
              </div>
            </section>

            {/* Section 5 */}
            <section>
              <h2 className="text-3xl text-gray-900 mb-4">5. Защита данных</h2>
              <div className="space-y-4 text-lg leading-relaxed">
                <p>
                  Мы применяем технические и организационные меры для защиты ваших данных:
                </p>
                <ul className="space-y-2 list-disc list-inside ml-4">
                  <li>Шифрование данных с использованием SSL/TLS протоколов</li>
                  <li>Двухфакторная аутентификация для доступа к личному кабинету</li>
                  <li>Регулярный аудит безопасности систем</li>
                  <li>Ограниченный доступ сотрудников к персональным данным</li>
                  <li>Резервное копирование и защита от потери данных</li>
                </ul>
                <p>
                  Несмотря на наши усилия, ни один метод передачи данных через Интернет не является на 100% безопасным.
                </p>
              </div>
            </section>

            {/* Section 6 */}
            <section>
              <h2 className="text-3xl text-gray-900 mb-4">6. Ваши права</h2>
              <div className="space-y-4 text-lg leading-relaxed">
                <p>В соответствии с законодательством вы имеете право:</p>
                <ul className="space-y-2 list-disc list-inside ml-4">
                  <li>Получить информацию о хранящихся у нас данных</li>
                  <li>Запросить исправление неточных данных</li>
                  <li>Удалить свои данные (право на забвение)</li>
                  <li>Ограничить обработку данных</li>
                  <li>Получить копию ваших данных в структурированном формате</li>
                  <li>Отозвать согласие на обработку в любое время</li>
                  <li>Подать жалобу в надзорный орган</li>
                </ul>
                <p>
                  Для реализации своих прав свяжитесь с нами по адресу: privacy@ecom.ru
                </p>
              </div>
            </section>

            {/* Section 7 */}
            <section>
              <h2 className="text-3xl text-gray-900 mb-4">7. Cookies</h2>
              <div className="space-y-4 text-lg leading-relaxed">
                <p>
                  Мы используем cookies для улучшения работы Платформы. Cookies — это небольшие текстовые файлы, 
                  сохраняемые на вашем устройстве.
                </p>
                <p>Мы используем следующие типы cookies:</p>
                <ul className="space-y-2 list-disc list-inside ml-4">
                  <li><strong>Необходимые</strong> — для корректной работы сайта</li>
                  <li><strong>Функциональные</strong> — для запоминания ваших предпочтений</li>
                  <li><strong>Аналитические</strong> — для анализа трафика и поведения пользователей</li>
                  <li><strong>Рекламные</strong> — для показа персонализированной рекламы</li>
                </ul>
                <p>
                  Вы можете управлять cookies в настройках браузера, но отключение некоторых из них может повлиять 
                  на функциональность сайта.
                </p>
              </div>
            </section>

            {/* Section 8 */}
            <section>
              <h2 className="text-3xl text-gray-900 mb-4">8. Хранение данных</h2>
              <div className="space-y-4 text-lg leading-relaxed">
                <p>
                  Мы храним ваши персональные данные только в течение необходимого срока:
                </p>
                <ul className="space-y-2 list-disc list-inside ml-4">
                  <li>Данные аккаунта — пока вы не удалите аккаунт</li>
                  <li>История заказов — 3 года для налоговой отчётности</li>
                  <li>Данные о платежах — в соответствии с требованиями платёжных систем</li>
                  <li>Аналитические данные — в обезличенном виде до 5 лет</li>
                </ul>
              </div>
            </section>

            {/* Section 9 */}
            <section>
              <h2 className="text-3xl text-gray-900 mb-4">9. Изменения в Политике</h2>
              <div className="space-y-4 text-lg leading-relaxed">
                <p>
                  Мы оставляем за собой право изменять данную Политику. При внесении существенных изменений мы 
                  уведомим вас по email или через уведомление на сайте.
                </p>
                <p>
                  Дата последнего обновления указана в начале документа. Рекомендуем периодически проверять эту страницу.
                </p>
              </div>
            </section>

            {/* Section 10 */}
            <section>
              <h2 className="text-3xl text-gray-900 mb-4">10. Контакты</h2>
              <div className="space-y-4 text-lg leading-relaxed">
                <p>
                  По вопросам обработки персональных данных свяжитесь с нами:
                </p>
                <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                  <p><strong>Email:</strong> privacy@ecom.ru</p>
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