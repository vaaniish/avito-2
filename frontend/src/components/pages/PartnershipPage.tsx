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
    <div className="min-h-screen app-shell">
      <div className="page-container pb-12 pt-6 md:pt-8 sm:pb-16">
        {/* Back Button */}
        <button
          onClick={onBack}
          className="back-link mb-7 text-sm sm:text-base"
        >
          <ArrowLeft className="w-6 h-6" />
          РќР°Р·Р°Рґ
        </button>

        {/* Header */}
        <div className="content-page text-center mb-10 sm:mb-12">
          <h1 className="text-3xl sm:text-5xl text-gray-900 mb-6">РџР°СЂС‚РЅС‘СЂСЃС‚РІРѕ</h1>
          <p className="text-lg sm:text-2xl text-gray-600">
            РЎС‚Р°РЅСЊС‚Рµ С‡Р°СЃС‚СЊСЋ СЌРєРѕСЃРёСЃС‚РµРјС‹ РєР°С‡РµСЃС‚РІРµРЅРЅРѕР№ С‚РѕСЂРіРѕРІР»Рё
          </p>
        </div>

        {/* Three Questions Section */}
        <div className="content-page mb-10 sm:mb-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Question 1 */}
            <div className="bg-gray-50 rounded-2xl p-8 border border-gray-200">
              <h2 className="text-2xl sm:text-3xl text-gray-900 mb-4">РљРѕРјСѓ РјРѕР¶РЅРѕ?</h2>
              <ul className="space-y-3 text-sm sm:text-lg text-gray-700">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-gray-900 flex-shrink-0 mt-1" />
                  Р‘СЂРµРЅРґС‹
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-gray-900 flex-shrink-0 mt-1" />
                  РњР°РіР°Р·РёРЅС‹
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-gray-900 flex-shrink-0 mt-1" />
                  Р”РѕРІРµСЂРµРЅРЅС‹Рµ С‡Р°СЃС‚РЅС‹Рµ РїСЂРѕРґР°РІС†С‹
                </li>
              </ul>
            </div>

            {/* Question 2 */}
            <div className="bg-gray-50 rounded-2xl p-8 border border-gray-200">
              <h2 className="text-2xl sm:text-3xl text-gray-900 mb-4">Р§С‚Рѕ РІС‹ РїРѕР»СѓС‡Р°РµС‚Рµ?</h2>
              <ul className="space-y-3 text-sm sm:text-lg text-gray-700">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-gray-900 flex-shrink-0 mt-1" />
                  РџР»Р°С‚С‘Р¶РµСЃРїРѕСЃРѕР±РЅСѓСЋ Р°СѓРґРёС‚РѕСЂРёСЋ
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-gray-900 flex-shrink-0 mt-1" />
                  Р”РѕРІРµСЂРёРµ РїРѕРєСѓРїР°С‚РµР»РµР№
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-gray-900 flex-shrink-0 mt-1" />
                  РћС‚СЃСѓС‚СЃС‚РІРёРµ РјСѓСЃРѕСЂР°
                </li>
              </ul>
            </div>

            {/* Question 3 */}
            <div className="bg-gray-50 rounded-2xl p-8 border border-gray-200">
              <h2 className="text-2xl sm:text-3xl text-gray-900 mb-4">РљР°Рє РІРѕР№С‚Рё?</h2>
              <ol className="space-y-3 text-sm sm:text-lg text-gray-700 list-decimal list-inside">
                <li>Р—Р°РїРѕР»РЅРёС‚Рµ Р·Р°СЏРІРєСѓ</li>
                <li>РџСЂРѕР№РґРёС‚Рµ РїСЂРѕРІРµСЂРєСѓ</li>
                <li>РџРѕР»СѓС‡РёС‚Рµ РґРѕСЃС‚СѓРї</li>
              </ol>
            </div>
          </div>
        </div>

        {/* Application Form */}
        <div className="content-page">
          <div className="bg-gray-50 rounded-2xl p-8 sm:p-12 border border-gray-200">
            <h2 className="text-2xl sm:text-4xl text-gray-900 mb-8 text-center">Р¤РѕСЂРјР° Р·Р°СЏРІРєРё</h2>
            
            {submitted ? (
              <div className="text-center py-12">
                <CheckCircle className="w-16 h-16 text-gray-900 mx-auto mb-4" />
                <h3 className="text-2xl sm:text-3xl text-gray-900 mb-2">Р—Р°СЏРІРєР° РѕС‚РїСЂР°РІР»РµРЅР°!</h3>
                <p className="text-base sm:text-xl text-gray-600">РњС‹ СЃРІСЏР¶РµРјСЃСЏ СЃ РІР°РјРё РІ Р±Р»РёР¶Р°Р№С€РµРµ РІСЂРµРјСЏ</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Seller Type */}
                <div>
                  <label className="block text-sm sm:text-lg text-gray-900 mb-3">РўРёРї РїСЂРѕРґР°РІС†Р° *</label>
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
                      <span className="text-sm sm:text-lg">РљРѕРјРїР°РЅРёСЏ</span>
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
                      <span className="text-sm sm:text-lg">Р§Р°СЃС‚РЅРѕРµ Р»РёС†Рѕ</span>
                    </button>
                  </div>
                </div>

                {/* Name */}
                <div>
                  <label className="block text-sm sm:text-lg text-gray-900 mb-3">
                    {formData.sellerType === 'company' ? 'РќР°Р·РІР°РЅРёРµ РєРѕРјРїР°РЅРёРё *' : 'Р’Р°С€Рµ РёРјСЏ *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-6 py-4 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900 text-sm sm:text-lg"
                    placeholder={formData.sellerType === 'company' ? 'РћРћРћ "РџСЂРёРјРµСЂ"' : 'РРІР°РЅ РџРµС‚СЂРѕРІ'}
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-sm sm:text-lg text-gray-900 mb-3">Email *</label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-6 py-4 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900 text-sm sm:text-lg"
                    placeholder="info@example.com"
                  />
                </div>

                {/* Contact */}
                <div>
                  <label className="block text-sm sm:text-lg text-gray-900 mb-3">РўРµР»РµС„РѕРЅ / Telegram *</label>
                  <input
                    type="text"
                    required
                    value={formData.contact}
                    onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
                    className="w-full px-6 py-4 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900 text-sm sm:text-lg"
                    placeholder="+7 900 123-45-67 РёР»Рё @username"
                  />
                </div>

                {/* Link */}
                <div>
                  <label className="block text-sm sm:text-lg text-gray-900 mb-3">
                    РЎСЃС‹Р»РєР° РЅР° СЃР°Р№С‚ / СЃРѕС†СЃРµС‚СЊ / РјР°СЂРєРµС‚РїР»РµР№СЃ *
                  </label>
                  <input
                    type="url"
                    required
                    value={formData.link}
                    onChange={(e) => setFormData({ ...formData, link: e.target.value })}
                    className="w-full px-6 py-4 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900 text-sm sm:text-lg"
                    placeholder="https://example.com"
                  />
                </div>

                {/* Category */}
                <div>
                  <label className="block text-sm sm:text-lg text-gray-900 mb-3">РљР°С‚РµРіРѕСЂРёСЏ С‚РѕРІР°СЂРѕРІ *</label>
                  <select
                    required
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-6 py-4 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900 text-sm sm:text-lg"
                  >
                    <option value="">Р’С‹Р±РµСЂРёС‚Рµ РєР°С‚РµРіРѕСЂРёСЋ</option>
                    <option value="Р­Р»РµРєС‚СЂРѕРЅРёРєР°">Р­Р»РµРєС‚СЂРѕРЅРёРєР°</option>
                    <option value="РћРґРµР¶РґР°">РћРґРµР¶РґР° Рё РѕР±СѓРІСЊ</option>
                    <option value="РњРµР±РµР»СЊ">РњРµР±РµР»СЊ Рё РёРЅС‚РµСЂСЊРµСЂ</option>
                    <option value="РљСЂР°СЃРѕС‚Р°">РљСЂР°СЃРѕС‚Р° Рё Р·РґРѕСЂРѕРІСЊРµ</option>
                    <option value="РЎРїРѕСЂС‚">РЎРїРѕСЂС‚ Рё РѕС‚РґС‹С…</option>
                    <option value="РЈСЃР»СѓРіРё">РЈСЃР»СѓРіРё</option>
                    <option value="Р”СЂСѓРіРѕРµ">Р”СЂСѓРіРѕРµ</option>
                  </select>
                </div>

                {/* Dynamic Fields - Company */}
                {formData.sellerType === 'company' && (
                  <>
                    <div>
                      <label className="block text-sm sm:text-lg text-gray-900 mb-3">РРќРќ / Р РµРі. РЅРѕРјРµСЂ (РѕРїС†РёРѕРЅР°Р»СЊРЅРѕ)</label>
                      <input
                        type="text"
                        value={formData.inn}
                        onChange={(e) => setFormData({ ...formData, inn: e.target.value })}
                        className="w-full px-6 py-4 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900 text-sm sm:text-lg"
                        placeholder="1234567890"
                      />
                    </div>

                    <div>
                      <label className="block text-sm sm:text-lg text-gray-900 mb-3">Р“РµРѕРіСЂР°С„РёСЏ СЂР°Р±РѕС‚С‹</label>
                      <input
                        type="text"
                        value={formData.geography}
                        onChange={(e) => setFormData({ ...formData, geography: e.target.value })}
                        className="w-full px-6 py-4 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900 text-sm sm:text-lg"
                        placeholder="РњРѕСЃРєРІР° Рё РѕР±Р»Р°СЃС‚СЊ / Р’СЃСЏ Р РѕСЃСЃРёСЏ"
                      />
                    </div>
                  </>
                )}

                {/* Dynamic Fields - Private */}
                {formData.sellerType === 'private' && (
                  <>
                    <div>
                      <label className="block text-sm sm:text-lg text-gray-900 mb-3">РЎСЃС‹Р»РєР° РЅР° СЃРѕС†СЃРµС‚СЊ СЃ РёСЃС‚РѕСЂРёРµР№ *</label>
                      <input
                        type="url"
                        required={formData.sellerType === 'private'}
                        value={formData.socialProfile}
                        onChange={(e) => setFormData({ ...formData, socialProfile: e.target.value })}
                        className="w-full px-6 py-4 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900 text-sm sm:text-lg"
                        placeholder="https://instagram.com/username"
                      />
                    </div>

                    <div>
                      <label className="block text-sm sm:text-lg text-gray-900 mb-3">
                        Р§РµРј РІС‹ РёР·РІРµСЃС‚РЅС‹ / РїРѕС‡РµРјСѓ РІР°Рј РјРѕР¶РЅРѕ РґРѕРІРµСЂСЏС‚СЊ? *
                      </label>
                      <textarea
                        required={formData.sellerType === 'private'}
                        value={formData.credibility}
                        onChange={(e) => setFormData({ ...formData, credibility: e.target.value })}
                        rows={4}
                        className="w-full px-6 py-4 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900 text-sm sm:text-lg resize-none"
                        placeholder="Р Р°СЃСЃРєР°Р¶РёС‚Рµ Рѕ СЃРµР±Рµ Рё СЃРІРѕРµР№ СЂРµРїСѓС‚Р°С†РёРё..."
                      />
                    </div>
                  </>
                )}

                {/* Golden Question */}
                <div className="bg-gray-50 rounded-xl p-6 border-2 border-gray-300">
                  <label className="block text-sm sm:text-lg text-gray-900 mb-3">
                    в­ђ РџРѕС‡РµРјСѓ РІС‹ С…РѕС‚РёС‚Рµ РїСЂРѕРґР°РІР°С‚СЊ РёРјРµРЅРЅРѕ Сѓ РЅР°СЃ? *
                  </label>
                  <textarea
                    required
                    value={formData.whyUs}
                    onChange={(e) => setFormData({ ...formData, whyUs: e.target.value })}
                    rows={4}
                    className="w-full px-6 py-4 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900 text-sm sm:text-lg resize-none"
                    placeholder="РџРѕРґРµР»РёС‚РµСЃСЊ РІР°С€РµР№ РјРѕС‚РёРІР°С†РёРµР№..."
                  />
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  className="w-full py-5 bg-gray-900 text-white rounded-xl hover:bg-black transition-all duration-300 text-base sm:text-xl"
                >
                  РћС‚РїСЂР°РІРёС‚СЊ Р·Р°СЏРІРєСѓ
                </button>

                <p className="text-gray-500 text-center text-sm">
                  * вЂ” РѕР±СЏР·Р°С‚РµР»СЊРЅС‹Рµ РїРѕР»СЏ
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
