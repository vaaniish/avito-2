import React from "react";
import {
  Book,
  FileText,
  Mail,
  Shield,
  AlertCircle,
  CheckCircle,
  XCircle,
  Users,
  DollarSign,
  BarChart,
} from "lucide-react";

export function HelpPage() {
  const sections = [
    {
      title: "Начало работы",
      icon: Book,
      color: "blue",
      items: [
        {
          title: "Вход в систему",
          content:
            "Используйте свои учетные данные администратора для входа в панель управления. Система поддерживает двухфакторную аутентификацию для повышенной безопасности.",
        },
        {
          title: "Обзор Dashboard",
          content:
            "Dashboard показывает ключевые метрики в реальном времени: средства на удержании, открытые споры, транзакции сегодня. Используйте эту страницу для быстрой оценки состояния платформы.",
        },
      ],
    },
    {
      title: "Управление транзакциями",
      icon: DollarSign,
      color: "green",
      items: [
        {
          title: "Статусы транзакций",
          content:
            "Транзакции могут иметь три статуса: 'На удержании' (средства заморожены до подтверждения доставки), 'Успешно' (средства переведены продавцу), 'Отменено' (средства возвращены покупателю).",
        },
        {
          title: "Эскроу-механизм",
          content:
            "Все платежи проходят через эскроу для защиты обеих сторон. Средства удерживаются до момента подтверждения успешной сделки или разрешения спора.",
        },
      ],
    },
    {
      title: "Разрешение споров",
      icon: AlertCircle,
      color: "red",
      items: [
        {
          title: "Процесс рассмотрения",
          content:
            "1. Проверьте детали спора и доказательства обеих сторон. 2. Запросите дополнительную информацию при необходимости. 3. Примите решение на основе политики платформы. 4. Задокументируйте решение для юридического следа.",
        },
        {
          title: "Типы решений",
          content:
            "Возврат средств покупателю - при подтверждении мошенничества или несоответствия товара. Перевод средств продавцу - при необоснованных претензиях покупателя. Частичный возврат - компромиссное решение.",
        },
      ],
    },
    {
      title: "Верификация продавцов (KYC)",
      icon: Shield,
      color: "purple",
      items: [
        {
          title: "Требования к документам",
          content:
            "Продавец должен предоставить: паспорт или удостоверение личности, свидетельство ИНН, документы о регистрации бизнеса (для юридических лиц), подтверждение адреса.",
        },
        {
          title: "Критерии одобрения",
          content:
            "Проверьте подлинность документов, соответствие ИНН в базах данных, отсутствие в черных списках. Одобряйте только полностью проверенных продавцов.",
        },
      ],
    },
    {
      title: "Модерация объявлений",
      icon: FileText,
      color: "yellow",
      items: [
        {
          title: "Критерии отклонения",
          content:
            "Подозрительно низкая цена, спам в описании, запрещенные товары, несоответствие изображений описанию, нарушение авторских прав.",
        },
        {
          title: "Массовые действия",
          content:
            "Используйте функцию массового снятия для быстрого удаления объявлений от заблокированных продавцов или при обнаружении схем мошенничества.",
        },
      ],
    },
    {
      title: "Управление комиссиями",
      icon: BarChart,
      color: "indigo",
      items: [
        {
          title: "Пирамида уровней",
          content:
            "Система автоматически присваивает продавцам уровни на основе объема продаж. Более активные продавцы получают более низкую комиссию как стимул.",
        },
        {
          title: "Индивидуальные настройки",
          content:
            "Используйте ручное изменение комиссии только для особых случаев (партнерства, компенсация за проблемы). Всегда документируйте причину изменения.",
        },
      ],
    },
  ];

  const emailTemplates = [
    {
      title: "Одобрение KYC",
      subject: "Ваша заявка одобрена - Ecom Marketplace",
      body: "Здравствуйте, {seller_name}!\n\nРады сообщить, что ваша заявка на верификацию продавца успешно одобрена. Теперь вы можете начать размещать товары на нашей платформе.\n\nДля начала работы:\n1. Войдите в личный кабинет\n2. Перейдите в раздел 'Мои товары'\n3. Создайте первое объявление\n\nУдачных продаж!\nКоманда Ecom",
    },
    {
      title: "Отклонение KYC",
      subject: "Требуются дополнительные документы - Ecom Marketplace",
      body: "Здравствуйте, {seller_name}!\n\nК сожалению, мы не смогли верифицировать вашу заявку по следующей причине:\n{rejection_reason}\n\nПожалуйста, предоставьте корректные документы и подайте заявку повторно.\n\nС уважением,\nКоманда Ecom",
    },
    {
      title: "Разрешение спора в пользу покупателя",
      subject: "Спор #{dispute_id} разрешен - Ecom Marketplace",
      body: "Здравствуйте, {buyer_name}!\n\nВаш спор #{dispute_id} был рассмотрен. После анализа предоставленных доказательств, мы приняли решение в вашу пользу.\n\nСредства в размере {amount} будут возвращены на ваш счет в течение 3-5 рабочих дней.\n\nБлагодарим за терпение.\nКоманда Ecom",
    },
  ];

  const colorStyles: Record<string, { bg: string; text: string; border: string }> = {
    blue: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
    green: { bg: "bg-green-50", text: "text-green-700", border: "border-green-200" },
    red: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
    purple: { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
    yellow: { bg: "bg-yellow-50", text: "text-yellow-700", border: "border-yellow-200" },
    indigo: { bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200" },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold mb-2">Помощь и документация</h1>
        <p className="text-sm md:text-base text-gray-600">
          Инструкции для администраторов и шаблоны писем
        </p>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
        <div className="p-4 md:p-6 bg-blue-50 rounded-2xl border-2 border-blue-200">
          <Book className="w-6 h-6 md:w-8 md:h-8 text-blue-600 mb-2 md:mb-3" />
          <h3 className="text-sm md:text-base font-bold mb-1 md:mb-2">Руководство</h3>
          <p className="text-xs md:text-sm text-gray-600">
            Полная документация по всем функциям админ-панели
          </p>
        </div>
        <div className="p-4 md:p-6 bg-purple-50 rounded-2xl border-2 border-purple-200">
          <Mail className="w-6 h-6 md:w-8 md:h-8 text-purple-600 mb-2 md:mb-3" />
          <h3 className="text-sm md:text-base font-bold mb-1 md:mb-2">Шаблоны писем</h3>
          <p className="text-xs md:text-sm text-gray-600">
            Готовые шаблоны для коммуникации с пользователями
          </p>
        </div>
        <div className="p-4 md:p-6 bg-green-50 rounded-2xl border-2 border-green-200">
          <Users className="w-6 h-6 md:w-8 md:h-8 text-green-600 mb-2 md:mb-3" />
          <h3 className="text-sm md:text-base font-bold mb-1 md:mb-2">Поддержка</h3>
          <p className="text-xs md:text-sm text-gray-600">
            Свяжитесь с техподдержкой: admin@ecomm.ru
          </p>
        </div>
      </div>

      {/* Documentation Sections */}
      <div className="space-y-4 md:space-y-6">
        {sections.map((section, idx) => {
          const Icon = section.icon;
          const styles = colorStyles[section.color];

          return (
            <div
              key={idx}
              className={`p-4 md:p-6 ${styles.bg} rounded-2xl border-2 ${styles.border}`}
            >
              <div className="flex items-center gap-2 md:gap-3 mb-3 md:mb-4">
                <Icon className={`w-5 h-5 md:w-6 md:h-6 ${styles.text}`} />
                <h2 className="text-lg md:text-xl font-bold">{section.title}</h2>
              </div>
              <div className="space-y-3 md:space-y-4">
                {section.items.map((item, itemIdx) => (
                  <div key={itemIdx} className="p-3 md:p-4 bg-white rounded-xl">
                    <h3 className="text-sm md:text-base font-bold mb-1 md:mb-2">{item.title}</h3>
                    <p className="text-xs md:text-sm text-gray-700 whitespace-pre-line">
                      {item.content}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Email Templates */}
      <div className="p-4 md:p-6 bg-white rounded-2xl border-2 border-gray-200">
        <div className="flex items-center gap-2 md:gap-3 mb-4 md:mb-6">
          <Mail className="w-5 h-5 md:w-6 md:h-6 text-gray-600" />
          <h2 className="text-lg md:text-xl font-bold">Шаблоны писем</h2>
        </div>
        <div className="space-y-3 md:space-y-4">
          {emailTemplates.map((template, idx) => (
            <div key={idx} className="p-4 md:p-6 bg-gray-50 rounded-xl">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3 md:mb-4">
                <div>
                  <h3 className="text-sm md:text-base font-bold mb-1">{template.title}</h3>
                  <p className="text-xs md:text-sm text-gray-600">
                    Тема: {template.subject}
                  </p>
                </div>
                <button className="px-3 md:px-4 py-2 bg-black text-white rounded-xl hover:bg-gray-900 transition-all text-xs md:text-sm font-medium whitespace-nowrap">
                  Копировать
                </button>
              </div>
              <div className="p-3 md:p-4 bg-white rounded-lg border border-gray-200">
                <pre className="text-xs md:text-sm text-gray-700 whitespace-pre-wrap font-sans">
                  {template.body}
                </pre>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Переменные: используйте {"{"}имя_переменной{"}"} для
                автозамены
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Best Practices */}
      <div className="p-4 md:p-6 bg-gradient-to-br from-gray-50 to-white rounded-2xl border-2 border-gray-200">
        <h2 className="text-lg md:text-xl font-bold mb-3 md:mb-4">Лучшие практики</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
          <div className="flex items-start gap-2 md:gap-3 p-3 md:p-4 bg-white rounded-xl">
            <CheckCircle className="w-4 h-4 md:w-5 md:h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-sm md:text-base font-bold mb-1">Документируйте решения</div>
              <p className="text-xs md:text-sm text-gray-600">
                Всегда оставляйте подробные комментарии при принятии решений по
                спорам и KYC
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2 md:gap-3 p-3 md:p-4 bg-white rounded-xl">
            <CheckCircle className="w-4 h-4 md:w-5 md:h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-sm md:text-base font-bold mb-1">Проверяйте доказательства</div>
              <p className="text-xs md:text-sm text-gray-600">
                Тщательно анализируйте все предоставленные документы и
                скриншоты
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2 md:gap-3 p-3 md:p-4 bg-white rounded-xl">
            <XCircle className="w-4 h-4 md:w-5 md:h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-sm md:text-base font-bold mb-1">Избегайте предвзятости</div>
              <p className="text-xs md:text-sm text-gray-600">
                Принимайте решения на основе фактов, а не личных предпочтений
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2 md:gap-3 p-3 md:p-4 bg-white rounded-xl">
            <XCircle className="w-4 h-4 md:w-5 md:h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-sm md:text-base font-bold mb-1">
                Не раскрывайте личные данные
              </div>
              <p className="text-xs md:text-sm text-gray-600">
                Соблюдайте конфиденциальность информации пользователей
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}