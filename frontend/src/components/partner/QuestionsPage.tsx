import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle, Clock, MessageCircle, Search, Send } from "lucide-react";
import { apiGet, apiPost } from "../../lib/api";

type Question = {
  id: string;
  listingId: string;
  listingTitle: string;
  buyerName: string;
  buyerId: string;
  question: string;
  answer?: string | null;
  status: "pending" | "answered";
  createdAt: string;
  answeredAt?: string | null;
};

type StatusFilter = "all" | "pending" | "answered";

export function QuestionsPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [searchQuery, setSearchQuery] = useState("");
  const [answerText, setAnswerText] = useState<Record<string, string>>({});
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);

  const loadQuestions = async () => {
    try {
      const result = await apiGet<Question[]>("/partner/questions");
      setQuestions(result);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Не удалось загрузить вопросы");
    }
  };

  useEffect(() => {
    void loadQuestions();
  }, []);

  const filteredQuestions = useMemo(
    () =>
      questions
        .filter((question) => {
          const matchesStatus = statusFilter === "all" || question.status === statusFilter;
          const query = searchQuery.toLowerCase();
          const matchesSearch =
            question.listingTitle.toLowerCase().includes(query) ||
            question.buyerName.toLowerCase().includes(query) ||
            question.question.toLowerCase().includes(query);
          return matchesStatus && matchesSearch;
        })
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()),
    [questions, searchQuery, statusFilter],
  );

  const stats = {
    total: questions.length,
    pending: questions.filter((question) => question.status === "pending").length,
    answered: questions.filter((question) => question.status === "answered").length,
  };

  const formatDate = (value: string) => {
    const now = new Date();
    const createdAt = new Date(value);
    const diffMs = now.getTime() - createdAt.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) {
      const diffMinutes = Math.max(1, Math.floor(diffMs / (1000 * 60)));
      return `${diffMinutes} мин. назад`;
    }

    if (diffHours < 24) {
      return `${diffHours} ч. назад`;
    }

    if (diffDays === 1) {
      return "Вчера";
    }

    if (diffDays < 7) {
      return `${diffDays} дн. назад`;
    }

    return createdAt.toLocaleDateString("ru-RU");
  };

  const handleSubmitAnswer = async (questionId: string) => {
    const answer = (answerText[questionId] || "").trim();
    if (!answer) return;

    try {
      await apiPost<{ success: boolean }>(`/partner/questions/${questionId}/answer`, { answer });
      setAnswerText((prev) => ({ ...prev, [questionId]: "" }));
      setExpandedQuestion(null);
      await loadQuestions();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Не удалось отправить ответ");
    }
  };

  const getStatusBadge = (status: Question["status"]) => {
    if (status === "pending") {
      return (
        <span className="px-3 py-1 bg-orange-100 text-orange-700 border border-orange-300 rounded-full text-xs font-medium flex items-center gap-1">
          <Clock className="w-3 h-3" /> Ожидает ответа
        </span>
      );
    }

    return (
      <span className="px-3 py-1 bg-green-100 text-green-700 border border-green-300 rounded-full text-xs font-medium flex items-center gap-1">
        <CheckCircle className="w-3 h-3" /> Отвечено
      </span>
    );
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="dashboard-title">Вопросы покупателей</h1>
        <p className="dashboard-subtitle">Отвечайте быстро, чтобы повышать доверие и продажи</p>
      </div>

      <div className="dashboard-grid-stats dashboard-grid-stats--3">
        <div className="dashboard-stat">
          <div className="dashboard-stat__label">Всего вопросов</div>
          <div className="dashboard-stat__value">{stats.total}</div>
        </div>
        <div className="dashboard-stat dashboard-stat--warn">
          <div className="dashboard-stat__label">Ожидают ответа</div>
          <div className="dashboard-stat__value">{stats.pending}</div>
        </div>
        <div className="dashboard-stat dashboard-stat--ok">
          <div className="dashboard-stat__label">Отвечено</div>
          <div className="dashboard-stat__value">{stats.answered}</div>
        </div>
      </div>

      <div className="dashboard-toolbar">
        <div className="flex flex-col gap-4">
          <div className="dashboard-search">
            <Search className="dashboard-search__icon" />
            <input
              type="text"
              placeholder="Поиск по товару, покупателю или вопросу..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="dashboard-search__input"
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <span className="text-sm font-medium text-gray-700">Статус:</span>
            <div className="dashboard-chip-row">
              {[
                { value: "all", label: "Все" },
                { value: "pending", label: "Ожидают ответа" },
                { value: "answered", label: "Отвечено" },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => setStatusFilter(option.value as StatusFilter)}
                  className={`dashboard-chip ${
                    statusFilter === option.value
                      ? "dashboard-chip--active"
                      : ""
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {filteredQuestions.map((question) => (
          <article key={question.id} className="dashboard-card md:p-5">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                  <MessageCircle className="w-4 h-4" />
                  <span className="truncate">{question.listingTitle}</span>
                </div>
                <div className="text-sm text-gray-500">{question.buyerName} • {formatDate(question.createdAt)}</div>
              </div>
              {getStatusBadge(question.status)}
            </div>

            <p className="text-gray-900 mb-3">{question.question}</p>

            {question.answer ? (
              <div className="bg-green-50 border border-green-200 rounded-xl p-3">
                <div className="text-xs text-green-700 mb-1">Ответ отправлен</div>
                <div className="text-sm text-gray-800">{question.answer}</div>
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  onClick={() =>
                    setExpandedQuestion((prev) => (prev === question.id ? null : question.id))
                  }
                  className="text-sm text-[rgb(38,83,141)] hover:underline"
                >
                  {expandedQuestion === question.id ? "Скрыть форму ответа" : "Ответить"}
                </button>

                {expandedQuestion === question.id && (
                  <div className="space-y-2">
                    <textarea
                      value={answerText[question.id] || ""}
                      onChange={(event) =>
                        setAnswerText((prev) => ({ ...prev, [question.id]: event.target.value }))
                      }
                      rows={4}
                      placeholder="Введите ответ покупателю"
                      className="field-control"
                    />
                    <button
                      onClick={() => void handleSubmitAnswer(question.id)}
                      className="btn-primary inline-flex items-center gap-2 px-4 py-2"
                    >
                      <Send className="w-4 h-4" /> Отправить ответ
                    </button>
                  </div>
                )}
              </div>
            )}
          </article>
        ))}

        {filteredQuestions.length === 0 && <div className="dashboard-empty">Вопросы не найдены</div>}
      </div>
    </div>
  );
}
