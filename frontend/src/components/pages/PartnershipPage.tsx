import React, { useState } from 'react';
import { ArrowLeft, Building, User, CheckCircle } from 'lucide-react';

interface PartnershipPageProps {
  onBack: () => void;
}

export function PartnershipPage({ onBack }: PartnershipPageProps) {
  const [formData, setFormData] = useState({
    sellerType: 'company' as 'company' | 'private',
    name: '',
    email: '',
    contact: '',
    link: '',
    category: '',
    // Company fields
    inn: '',
    geography: '',
    // Private fields
    socialProfile: '',
    credibility: '',
    // Question
    whyUs: ''
  });

  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Here would be the actual submission logic
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      // Reset form
      setFormData({
        sellerType: 'company',
        name: '',
        email: '',
        contact: '',
        link: '',
        category: '',
        inn: '',
        geography: '',
        socialProfile: '',
        credibility: '',
        whyUs: ''
      });
    }, 3000);
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
          <h1 className="text-5xl sm:text-6xl text-gray-900 mb-6">Партнёрство</h1>
          <p className="text-2xl text-gray-600">
            Станьте частью экосистемы качественной торговли
          </p>
        </div>

        {/* Three Questions Section */}
        <div className="max-w-5xl mx-auto mb-16">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Question 1 */}
            <div className="bg-gray-50 rounded-2xl p-8 border border-gray-200">
              <h2 className="text-3xl text-gray-900 mb-4">Кому можно?</h2>
              <ul className="space-y-3 text-lg text-gray-700">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-gray-900 flex-shrink-0 mt-1" />
                  Бренды
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-gray-900 flex-shrink-0 mt-1" />
                  Магазины
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-gray-900 flex-shrink-0 mt-1" />
                  Доверенные частные продавцы
                </li>
              </ul>
            </div>

            {/* Question 2 */}
            <div className="bg-gray-50 rounded-2xl p-8 border border-gray-200">
              <h2 className="text-3xl text-gray-900 mb-4">Что вы получаете?</h2>
              <ul className="space-y-3 text-lg text-gray-700">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-gray-900 flex-shrink-0 mt-1" />
                  Платёжеспособную аудиторию
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-gray-900 flex-shrink-0 mt-1" />
                  Доверие покупателей
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-gray-900 flex-shrink-0 mt-1" />
                  Отсутствие мусора
                </li>
              </ul>
            </div>

            {/* Question 3 */}
            <div className="bg-gray-50 rounded-2xl p-8 border border-gray-200">
              <h2 className="text-3xl text-gray-900 mb-4">Как войти?</h2>
              <ol className="space-y-3 text-lg text-gray-700 list-decimal list-inside">
                <li>Заполните заявку</li>
                <li>Пройдите проверку</li>
                <li>Получите доступ</li>
              </ol>
            </div>
          </div>
        </div>

        {/* Application Form */}
        <div className="max-w-3xl mx-auto">
          <div className="bg-gray-50 rounded-2xl p-8 sm:p-12 border border-gray-200">
            <h2 className="text-4xl text-gray-900 mb-8 text-center">Форма заявки</h2>
            
            {submitted ? (
              <div className="text-center py-12">
                <CheckCircle className="w-16 h-16 text-gray-900 mx-auto mb-4" />
                <h3 className="text-3xl text-gray-900 mb-2">Заявка отправлена!</h3>
                <p className="text-xl text-gray-600">Мы свяжемся с вами в ближайшее время</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Seller Type */}
                <div>
                  <label className="block text-lg text-gray-900 mb-3">Тип продавца *</label>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, sellerType: 'company' })}
                      className={`flex items-center justify-center gap-3 p-4 rounded-xl border-2 transition-all duration-300 ${
                        formData.sellerType === 'company'
                          ? 'border-gray-900 bg-gray-900 text-white'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'
                      }`}
                    >
                      <Building className="w-6 h-6" />
                      <span className="text-lg">Компания</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, sellerType: 'private' })}
                      className={`flex items-center justify-center gap-3 p-4 rounded-xl border-2 transition-all duration-300 ${
                        formData.sellerType === 'private'
                          ? 'border-gray-900 bg-gray-900 text-white'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'
                      }`}
                    >
                      <User className="w-6 h-6" />
                      <span className="text-lg">Частное лицо</span>
                    </button>
                  </div>
                </div>

                {/* Name */}
                <div>
                  <label className="block text-lg text-gray-900 mb-3">
                    {formData.sellerType === 'company' ? 'Название компании *' : 'Ваше имя *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-6 py-4 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900 text-lg"
                    placeholder={formData.sellerType === 'company' ? 'ООО "Пример"' : 'Иван Петров'}
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-lg text-gray-900 mb-3">Email *</label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-6 py-4 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900 text-lg"
                    placeholder="info@example.com"
                  />
                </div>

                {/* Contact */}
                <div>
                  <label className="block text-lg text-gray-900 mb-3">Телефон / Telegram *</label>
                  <input
                    type="text"
                    required
                    value={formData.contact}
                    onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
                    className="w-full px-6 py-4 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900 text-lg"
                    placeholder="+7 900 123-45-67 или @username"
                  />
                </div>

                {/* Link */}
                <div>
                  <label className="block text-lg text-gray-900 mb-3">
                    Ссылка на сайт / соцсеть / маркетплейс *
                  </label>
                  <input
                    type="url"
                    required
                    value={formData.link}
                    onChange={(e) => setFormData({ ...formData, link: e.target.value })}
                    className="w-full px-6 py-4 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900 text-lg"
                    placeholder="https://example.com"
                  />
                </div>

                {/* Category */}
                <div>
                  <label className="block text-lg text-gray-900 mb-3">Категория товаров *</label>
                  <select
                    required
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-6 py-4 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900 text-lg"
                  >
                    <option value="">Выберите категорию</option>
                    <option value="Электроника">Электроника</option>
                    <option value="Одежда">Одежда и обувь</option>
                    <option value="Мебель">Мебель и интерьер</option>
                    <option value="Красота">Красота и здоровье</option>
                    <option value="Спорт">Спорт и отдых</option>
                    <option value="Услуги">Услуги</option>
                    <option value="Другое">Другое</option>
                  </select>
                </div>

                {/* Dynamic Fields - Company */}
                {formData.sellerType === 'company' && (
                  <>
                    <div>
                      <label className="block text-lg text-gray-900 mb-3">ИНН / Рег. номер (опционально)</label>
                      <input
                        type="text"
                        value={formData.inn}
                        onChange={(e) => setFormData({ ...formData, inn: e.target.value })}
                        className="w-full px-6 py-4 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900 text-lg"
                        placeholder="1234567890"
                      />
                    </div>

                    <div>
                      <label className="block text-lg text-gray-900 mb-3">География работы</label>
                      <input
                        type="text"
                        value={formData.geography}
                        onChange={(e) => setFormData({ ...formData, geography: e.target.value })}
                        className="w-full px-6 py-4 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900 text-lg"
                        placeholder="Москва и область / Вся Россия"
                      />
                    </div>
                  </>
                )}

                {/* Dynamic Fields - Private */}
                {formData.sellerType === 'private' && (
                  <>
                    <div>
                      <label className="block text-lg text-gray-900 mb-3">Ссылка на соцсеть с историей *</label>
                      <input
                        type="url"
                        required={formData.sellerType === 'private'}
                        value={formData.socialProfile}
                        onChange={(e) => setFormData({ ...formData, socialProfile: e.target.value })}
                        className="w-full px-6 py-4 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900 text-lg"
                        placeholder="https://instagram.com/username"
                      />
                    </div>

                    <div>
                      <label className="block text-lg text-gray-900 mb-3">
                        Чем вы известны / почему вам можно доверять? *
                      </label>
                      <textarea
                        required={formData.sellerType === 'private'}
                        value={formData.credibility}
                        onChange={(e) => setFormData({ ...formData, credibility: e.target.value })}
                        rows={4}
                        className="w-full px-6 py-4 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900 text-lg resize-none"
                        placeholder="Расскажите о себе и своей репутации..."
                      />
                    </div>
                  </>
                )}

                {/* Golden Question */}
                <div className="bg-gray-50 rounded-xl p-6 border-2 border-gray-300">
                  <label className="block text-lg text-gray-900 mb-3">
                    ⭐ Почему вы хотите продавать именно у нас? *
                  </label>
                  <textarea
                    required
                    value={formData.whyUs}
                    onChange={(e) => setFormData({ ...formData, whyUs: e.target.value })}
                    rows={4}
                    className="w-full px-6 py-4 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900 text-lg resize-none"
                    placeholder="Поделитесь вашей мотивацией..."
                  />
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  className="w-full py-5 bg-gray-900 text-white rounded-xl hover:bg-black transition-all duration-300 text-xl"
                >
                  Отправить заявку
                </button>

                <p className="text-gray-500 text-center text-sm">
                  * — обязательные поля
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}