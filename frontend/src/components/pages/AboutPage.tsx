import React from 'react';
import { ArrowLeft } from 'lucide-react';

interface AboutPageProps {
  onBack: () => void;
}

export function AboutPage({ onBack }: AboutPageProps) {
  return (
    <div className="min-h-screen app-shell">
      <div className="page-container pb-12 pt-6 md:pt-8 sm:pb-16">
        <button
          onClick={onBack}
          className="back-link mb-7 text-sm sm:text-base"
        >
          <ArrowLeft className="h-5 w-5" />
          РќР°Р·Р°Рґ
        </button>

        <div className="content-page">
          <h1 className="mb-6 text-slate-900">Рћ РЅР°СЃ</h1>
          
          <div className="space-y-8">
            <div>
              <h2 className="mb-3 text-slate-900">РќР°С€Р° РјРёСЃСЃРёСЏ</h2>
              <p>
                Ecom вЂ” СЌС‚Рѕ СѓРЅРёРІРµСЂСЃР°Р»СЊРЅР°СЏ B2C РїР»РѕС‰Р°РґРєР°, РєРѕС‚РѕСЂР°СЏ РѕР±СЉРµРґРёРЅСЏРµС‚ РєР°С‡РµСЃС‚РІРµРЅРЅС‹Рµ С‚РѕРІР°СЂС‹ Рё СѓСЃР»СѓРіРё РІ РѕРґРЅРѕРј РјРµСЃС‚Рµ. 
                РњС‹ СЃРѕР·РґР°Р»Рё РїР»Р°С‚С„РѕСЂРјСѓ, РіРґРµ РїРѕРєСѓРїР°С‚РµР»Рё РЅР°С…РѕРґСЏС‚ РІСЃС‘ РЅРµРѕР±С…РѕРґРёРјРѕРµ, Р° РїСЂРѕРІРµСЂРµРЅРЅС‹Рµ РїСЂРѕРґР°РІС†С‹ РїРѕР»СѓС‡Р°СЋС‚ РґРѕСЃС‚СѓРї 
                Рє РїР»Р°С‚С‘Р¶РµСЃРїРѕСЃРѕР±РЅРѕР№ Р°СѓРґРёС‚РѕСЂРёРё.
              </p>
            </div>

            <div>
              <h2 className="mb-3 text-slate-900">РќР°С€Рё РїСЂРёРЅС†РёРїС‹</h2>
              <div className="space-y-4">
                <div className="surface-card p-5">
                  <h3 className="mb-2 text-xl font-semibold text-gray-900">РљР°С‡РµСЃС‚РІРѕ</h3>
                  <p>
                    РњС‹ С‚С‰Р°С‚РµР»СЊРЅРѕ РїСЂРѕРІРµСЂСЏРµРј РєР°Р¶РґРѕРіРѕ РїСЂРѕРґР°РІС†Р° РїРµСЂРµРґ РґРѕРїСѓСЃРєРѕРј РЅР° РїР»Р°С‚С„РѕСЂРјСѓ. 
                    РўРѕР»СЊРєРѕ Р±СЂРµРЅРґС‹, РјР°РіР°Р·РёРЅС‹ Рё РґРѕРІРµСЂРµРЅРЅС‹Рµ С‡Р°СЃС‚РЅС‹Рµ РїСЂРѕРґР°РІС†С‹.
                  </p>
                </div>

                <div className="surface-card p-5">
                  <h3 className="mb-2 text-xl font-semibold text-gray-900">Р”РѕРІРµСЂРёРµ</h3>
                  <p>
                    РЎРёСЃС‚РµРјР° СЂРµР№С‚РёРЅРіРѕРІ, РѕС‚Р·С‹РІРѕРІ Рё РІРµСЂРёС„РёРєР°С†РёРё РїСЂРѕРґР°РІС†РѕРІ СЃРѕР·РґР°С‘С‚ Р±РµР·РѕРїР°СЃРЅСѓСЋ 
                    СЃСЂРµРґСѓ РґР»СЏ РїРѕРєСѓРїРѕРє.
                  </p>
                </div>

                <div className="surface-card p-5">
                  <h3 className="mb-2 text-xl font-semibold text-gray-900">РЈРґРѕР±СЃС‚РІРѕ</h3>
                  <p>
                    РњРёРЅРёРјР°Р»РёСЃС‚РёС‡РЅС‹Р№ РґРёР·Р°Р№РЅ, СѓРјРЅС‹Р№ РїРѕРёСЃРє Рё РёРЅС‚СѓРёС‚РёРІРЅР°СЏ РЅР°РІРёРіР°С†РёСЏ вЂ” 
                    РІСЃС‘ РґР»СЏ РІР°С€РµРіРѕ РєРѕРјС„РѕСЂС‚Р°.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <h2 className="mb-3 text-slate-900">РџРѕС‡РµРјСѓ РІС‹Р±РёСЂР°СЋС‚ РЅР°СЃ</h2>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <span className="w-2 h-2 bg-gray-900 rounded-full mt-3 flex-shrink-0"></span>
                  <span>РЁРёСЂРѕРєРёР№ Р°СЃСЃРѕСЂС‚РёРјРµРЅС‚ С‚РѕРІР°СЂРѕРІ Рё СѓСЃР»СѓРі РІ РѕРґРЅРѕРј РјРµСЃС‚Рµ</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-2 h-2 bg-gray-900 rounded-full mt-3 flex-shrink-0"></span>
                  <span>РџСЂРѕРІРµСЂРµРЅРЅС‹Рµ РїСЂРѕРґР°РІС†С‹ СЃ РіР°СЂР°РЅС‚РёРµР№ РєР°С‡РµСЃС‚РІР°</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-2 h-2 bg-gray-900 rounded-full mt-3 flex-shrink-0"></span>
                  <span>РџСЂРѕР·СЂР°С‡РЅР°СЏ СЃРёСЃС‚РµРјР° РѕС‚Р·С‹РІРѕРІ Рё СЂРµР№С‚РёРЅРіРѕРІ</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-2 h-2 bg-gray-900 rounded-full mt-3 flex-shrink-0"></span>
                  <span>РЈРґРѕР±РЅС‹Рµ СЃРїРѕСЃРѕР±С‹ РѕРїР»Р°С‚С‹ Рё Р±С‹СЃС‚СЂР°СЏ РґРѕСЃС‚Р°РІРєР°</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-2 h-2 bg-gray-900 rounded-full mt-3 flex-shrink-0"></span>
                  <span>РџРѕРґРґРµСЂР¶РєР° РїРѕРєСѓРїР°С‚РµР»РµР№ 24/7</span>
                </li>
              </ul>
            </div>

            <div className="rounded-2xl bg-[rgb(15,30,53)] p-6 text-white sm:p-10">
              <h2 className="mb-3 text-2xl font-semibold sm:text-3xl">РџСЂРёСЃРѕРµРґРёРЅСЏР№С‚РµСЃСЊ Рє РЅР°Рј</h2>
              <p className="mb-6 text-sm text-blue-100 sm:text-lg">
                РЎС‚Р°РЅСЊС‚Рµ С‡Р°СЃС‚СЊСЋ СЌРєРѕСЃРёСЃС‚РµРјС‹, РіРґРµ РєР°С‡РµСЃС‚РІРѕ РІСЃС‚СЂРµС‡Р°РµС‚СЃСЏ СЃ СѓРґРѕР±СЃС‚РІРѕРј, 
                Р° РґРѕРІРµСЂРёРµ СЏРІР»СЏРµС‚СЃСЏ РѕСЃРЅРѕРІРѕР№ РєР°Р¶РґРѕР№ СЃРґРµР»РєРё.
              </p>
              <button className="btn-secondary px-6 py-3 text-sm font-semibold sm:text-base">
                РќР°С‡Р°С‚СЊ РїСЂРѕРґР°РІР°С‚СЊ
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

