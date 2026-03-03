import React, { useEffect, useMemo, useState } from "react";
import {
  Award,
  Calendar,
  CheckCircle,
  Lock,
  Target,
  TrendingUp,
  Trophy,
  Zap,
  Star,
  AlertCircle,
} from "lucide-react";
import { apiGet, apiPost } from "../../lib/api";

interface LoyaltyLevel {
  level_id: number;
  level_name: string;
  xp_threshold: number;
  xp_coefficient: number;
  xp_rule_description: string;
  commission_rate: number;
}

interface AchievementProgressApi {
  achievement_id: number;
  name: string;
  display_name: string;
  description: string;
  display_description: string;
  icon: string;
  xp_reward: number;
  is_secret: boolean;
  unlocked: boolean;
  achieved_date: string | null;
  progress_value: number;
  progress_target: number;
  progress_percent: number;
  progress_label: string;
}

interface XpAccrual {
  accrual_id: number;
  order_id: string;
  deal_amount?: number;
  xp_amount: number;
  accrual_date: string;
  description: string;
}

interface XpPolicy {
  formula: string;
  deductions: string[];
}

interface PartnerStatsResponse {
  partner_id: number;
  name: string;
  current_xp: number;
  rating: number;
  current_level: string;
  xp_coefficient: number;
  commission_rate: number;
  loyalty_levels: LoyaltyLevel[];
  achievements_catalog: AchievementProgressApi[];
  xp_policy?: XpPolicy;
  next_level: {
    level_name: string;
    xp_needed: number;
  } | null;
}

export function AchievementsPage() {
  const [activeTab, setActiveTab] = useState<"overview" | "achievements" | "history">("overview");
  const [partnerData, setPartnerData] = useState<PartnerStatsResponse | null>(null);
  const [xpHistory, setXpHistory] = useState<XpAccrual[]>([]);
  const [loading, setLoading] = useState(true);
  const [saleLoading, setSaleLoading] = useState(false);
  const [saleAmountInput, setSaleAmountInput] = useState("500");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchPartnerData = async () => {
    const data = await apiGet<PartnerStatsResponse>(
      "/gamification/partner-stats",
    );
    setPartnerData(data);
  };

  const fetchXpHistory = async () => {
    const data = await apiGet<XpAccrual[]>("/gamification/xp-history");
    setXpHistory(data);
  };

  const refreshData = async () => {
    setLoading(true);
    try {
      await Promise.all([fetchPartnerData(), fetchXpHistory()]);
      setError(null);
    } catch (fetchError) {
      console.error(fetchError);
      setError(fetchError instanceof Error ? fetchError.message : "Ошибка загрузки данных");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshData();
  }, []);

  const handleSimulateSale = async () => {
    setSaleLoading(true);
    setFeedback(null);
    setError(null);

    try {
      const normalized = saleAmountInput.trim();
      const parsedAmount = Number(normalized);
      const hasManualAmount = normalized.length > 0 && Number.isFinite(parsedAmount);
      const payload = hasManualAmount ? { deal_amount: Math.round(parsedAmount) } : {};

      const responseBody = await apiPost<{ message?: string }>(
        "/gamification/simulate-sale",
        payload,
      );

      setFeedback(responseBody.message ?? "Сделка подтверждена");
      await refreshData();
    } catch (saleError) {
      console.error(saleError);
      setError(saleError instanceof Error ? saleError.message : "Ошибка сделки");
    } finally {
      setSaleLoading(false);
    }
  };

  const handleResetSandbox = async () => {
    setFeedback(null);
    setError(null);

    try {
      const responseBody = await apiPost<{ message?: string }>(
        "/gamification/reset-sandbox",
      );

      setFeedback(responseBody.message ?? "Песочница сброшена");
      await refreshData();
    } catch (resetError) {
      console.error(resetError);
      setError(resetError instanceof Error ? resetError.message : "Ошибка сброса");
    }
  };

  const loyaltyLevels = partnerData?.loyalty_levels ?? [];
  const currentXp = partnerData?.current_xp ?? 0;
  const currentLevelName = partnerData?.current_level ?? "";
  const currentLevel =
    loyaltyLevels.find((level) => level.level_name === currentLevelName) ??
    loyaltyLevels[0] ?? {
      level_id: 0,
      level_name: "Нет данных",
      xp_threshold: 0,
      xp_coefficient: 1,
      xp_rule_description: "Нет данных",
      commission_rate: 0,
    };
  const currentLevelId = currentLevel.level_id;

  const nextLevel = loyaltyLevels.find(
    (level) => level.xp_threshold > currentXp,
  );
  const xpInCurrentLevel = Math.max(
    currentXp - currentLevel.xp_threshold,
    0,
  );
  const xpNeededForNextLevel = nextLevel
    ? nextLevel.xp_threshold - currentLevel.xp_threshold
    : 0;
  const progressPercent =
    nextLevel && xpNeededForNextLevel > 0
      ? Math.min((xpInCurrentLevel / xpNeededForNextLevel) * 100, 100)
      : 100;

  const achievementsCatalog = partnerData?.achievements_catalog ?? [];
  const earnedAchievements = useMemo(
    () => achievementsCatalog.filter((achievement) => achievement.unlocked),
    [achievementsCatalog],
  );
  const lockedAchievements = useMemo(
    () => achievementsCatalog.filter((achievement) => !achievement.unlocked),
    [achievementsCatalog],
  );

  const getIcon = (iconName: string, isSecret: boolean) => {
    const icons: Record<string, React.ReactNode> = {
      star: <Star className="w-6 h-6" />,
      trophy: <Trophy className="w-6 h-6" />,
      zap: <Zap className="w-6 h-6" />,
      award: <Award className="w-6 h-6" />,
      target: <Target className="w-6 h-6" />,
    };

    if (isSecret) {
      return <Lock className="w-6 h-6" />;
    }

    return icons[iconName] ?? <Star className="w-6 h-6" />;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold mb-2">Достижения и уровни</h1>
        <p className="text-gray-600">Система геймификации: прогресс, достижения и бонусы</p>
      </div>

      <div className="p-4 md:p-6 bg-blue-50 border-2 border-blue-300 rounded-xl">
        <div className="flex flex-wrap gap-4 items-end">
          <label className="flex flex-col gap-2 text-sm text-gray-700 min-w-[220px]">
            Сумма сделки (руб.)
            <input
              type="number"
              min={100}
              step={100}
              value={saleAmountInput}
              onChange={(event) => setSaleAmountInput(event.target.value)}
              className="px-3 py-2 border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              placeholder="Пусто = случайная сумма"
            />
          </label>
          <button
            onClick={handleSimulateSale}
            disabled={saleLoading}
            className="px-6 py-3 bg-blue-700 text-white rounded-lg hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed font-semibold shadow"
          >
            {saleLoading ? "Обработка..." : "Подтвердить сделку"}
          </button>
          <button
            onClick={handleResetSandbox}
            className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-semibold"
          >
            Сбросить песочницу
          </button>
        </div>
        {feedback && <p className="mt-3 text-sm text-green-700">{feedback}</p>}
        {error && (
          <p className="mt-3 text-sm text-red-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            {error}
          </p>
        )}
      </div>

      <div className="p-4 md:p-6 bg-gradient-to-br from-gray-900 to-gray-700 rounded-xl md:rounded-2xl text-white">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 md:p-3 bg-white/10 rounded-lg md:rounded-xl backdrop-blur-sm">
              <Trophy className="w-6 h-6 md:w-8 md:h-8" />
            </div>
            <div>
              <div className="text-xs md:text-sm text-gray-300">Текущий уровень</div>
              <div className="text-xl md:text-2xl font-bold">{currentLevel.level_name}</div>
            </div>
          </div>
          <div className="text-left sm:text-right">
            <div className="text-xs md:text-sm text-gray-300">Опыт</div>
            <div className="text-xl md:text-2xl font-bold">{currentXp.toLocaleString()} XP</div>
          </div>
        </div>

        {nextLevel && (
          <div>
            <div className="flex justify-between text-xs md:text-sm mb-2">
              <span>До следующего уровня: {nextLevel.level_name}</span>
              <span className="font-medium">
                {(nextLevel.xp_threshold - currentXp).toLocaleString()} XP
              </span>
            </div>
            <div className="h-2.5 md:h-3 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-white rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-1 md:gap-2 border-b border-gray-200 overflow-x-auto">
        <button
          onClick={() => setActiveTab("overview")}
          className={`px-3 md:px-4 py-2 md:py-3 font-medium transition-all whitespace-nowrap text-sm md:text-base ${
            activeTab === "overview" ? "border-b-2 border-black text-black" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Обзор
        </button>
        <button
          onClick={() => setActiveTab("achievements")}
          className={`px-3 md:px-4 py-2 md:py-3 font-medium transition-all whitespace-nowrap text-sm md:text-base ${
            activeTab === "achievements" ? "border-b-2 border-black text-black" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Достижения ({earnedAchievements.length}/{achievementsCatalog.length})
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={`px-3 md:px-4 py-2 md:py-3 font-medium transition-all whitespace-nowrap text-sm md:text-base ${
            activeTab === "history" ? "border-b-2 border-black text-black" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          История XP
        </button>
      </div>

      {activeTab === "overview" && (
        <div className="space-y-6">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="p-6 bg-white border-2 border-gray-200 rounded-xl">
              <div className="flex items-center gap-3 mb-3">
                <TrendingUp className="w-5 h-5 text-gray-700" />
                <h3 className="font-bold text-lg">Множитель опыта</h3>
              </div>
              <div className="text-3xl font-bold mb-2">
                ×{currentLevel.xp_coefficient}
              </div>
              <p className="text-sm text-gray-600">
                {currentLevel.xp_rule_description}
              </p>
            </div>

            <div className="p-6 bg-white border-2 border-gray-200 rounded-xl">
              <div className="flex items-center gap-3 mb-3">
                <Award className="w-5 h-5 text-gray-700" />
                <h3 className="font-bold text-lg">Комиссия платформы</h3>
              </div>
              <div className="text-3xl font-bold mb-2">
                {currentLevel.commission_rate}%
              </div>
              <p className="text-sm text-gray-600">Текущая ставка комиссии за сделки</p>
            </div>
          </div>

          <div className="p-4 md:p-6 bg-white border-2 border-gray-200 rounded-xl">
            <h3 className="font-bold text-base md:text-lg mb-4">Правила начисления XP</h3>
            <p className="text-sm text-gray-700 mb-3">{partnerData?.xp_policy?.formula}</p>
            <div className="space-y-2">
              {(partnerData?.xp_policy?.deductions ?? []).map((deduction) => (
                <div key={deduction} className="text-sm text-gray-600">
                  • {deduction}
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 md:p-6 bg-white border-2 border-gray-200 rounded-xl">
            <h3 className="font-bold text-base md:text-lg mb-4">Все уровни и бонусы</h3>
            <div className="space-y-3">
              {loyaltyLevels.map((level, idx) => {
                const isCurrent = level.level_id === currentLevelId;
                const isPast = level.level_id < currentLevelId;

                return (
                  <div
                    key={level.level_id}
                    className={`p-3 md:p-4 rounded-xl border-2 transition-all ${
                      isCurrent
                        ? "bg-gray-900 text-white border-gray-900"
                        : isPast
                        ? "bg-gray-50 border-gray-200"
                        : "bg-white border-gray-200"
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center font-bold text-sm md:text-base ${
                            isCurrent
                              ? "bg-white text-gray-900"
                              : isPast
                              ? "bg-gray-300 text-gray-600"
                              : "bg-gray-200 text-gray-400"
                          }`}
                        >
                          {idx + 1}
                        </div>
                        <div>
                          <div className="font-bold text-sm md:text-base">{level.level_name}</div>
                          <div className={`text-xs md:text-sm ${isCurrent ? "text-gray-300" : "text-gray-500"}`}>
                            {level.xp_threshold.toLocaleString()} XP
                          </div>
                        </div>
                      </div>
                      <div className="text-left sm:text-right text-xs md:text-sm pl-11 sm:pl-0">
                        <div className={`font-medium ${isCurrent ? "text-gray-300" : "text-gray-600"}`}>
                          XP ×{level.xp_coefficient} • Комиссия {level.commission_rate}%
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {activeTab === "achievements" && (
        <div className="space-y-6">
          <div>
            <h3 className="font-bold text-lg mb-4">Полученные достижения ({earnedAchievements.length})</h3>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {earnedAchievements.map((achievement) => (
                <div
                  key={achievement.achievement_id}
                  className="p-5 bg-gradient-to-br from-gray-900 to-gray-700 text-white rounded-xl border-2 border-gray-900"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="p-3 bg-white/10 rounded-xl backdrop-blur-sm">
                      {getIcon(achievement.icon, false)}
                    </div>
                    <CheckCircle className="w-5 h-5 text-green-400" />
                  </div>
                  <h4 className="font-bold mb-1">{achievement.display_name}</h4>
                  <p className="text-sm text-gray-300 mb-3">{achievement.display_description}</p>
                  <div className="mb-3">
                    <div className="flex justify-between text-xs text-gray-300 mb-1">
                      <span>Прогресс</span>
                      <span>{achievement.progress_label}</span>
                    </div>
                    <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                      <div className="h-full bg-green-400 rounded-full" style={{ width: `${achievement.progress_percent}%` }} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-yellow-300 font-medium">+{achievement.xp_reward} XP</span>
                    <span className="text-gray-400">{achievement.achieved_date ? formatDate(achievement.achieved_date) : ""}</span>
                  </div>
                </div>
              ))}
              {!loading && earnedAchievements.length === 0 && (
                <div className="p-5 bg-white border-2 border-gray-200 rounded-xl text-sm text-gray-500">
                  Пока нет открытых достижений.
                </div>
              )}
            </div>
          </div>

          <div>
            <h3 className="font-bold text-lg mb-4">В процессе ({lockedAchievements.length})</h3>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {lockedAchievements.map((achievement) => (
                <div
                  key={achievement.achievement_id}
                  className="p-5 bg-white border-2 border-gray-200 rounded-xl"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="p-3 bg-gray-100 rounded-xl">
                      {getIcon(achievement.icon, achievement.is_secret)}
                    </div>
                    <Lock className="w-5 h-5 text-gray-400" />
                  </div>
                  <h4 className="font-bold mb-1 text-gray-800">{achievement.display_name}</h4>
                  <p className="text-sm text-gray-600 mb-3">{achievement.display_description}</p>
                  <div className="mb-3">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>Прогресс</span>
                      <span>{achievement.is_secret ? "Скрыт" : achievement.progress_label}</span>
                    </div>
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${achievement.progress_percent}%` }} />
                    </div>
                  </div>
                  <div className="text-sm text-gray-500 font-medium">+{achievement.xp_reward} XP</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === "history" && (
        <div className="p-6 bg-white border-2 border-gray-200 rounded-xl">
          <h3 className="font-bold text-lg mb-4">История начисления опыта</h3>
          <div className="space-y-3">
            {xpHistory.map((accrual) => {
              const isPositive = accrual.xp_amount >= 0;
              const amountLabel = `${isPositive ? "+" : ""}${accrual.xp_amount} XP`;

              return (
                <div
                  key={accrual.accrual_id}
                  className="p-4 border-2 border-gray-200 rounded-xl hover:border-gray-300 transition-all"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-gray-100 rounded-lg">
                        <Zap className="w-5 h-5 text-gray-700" />
                      </div>
                      <div>
                        <div className="font-medium">{accrual.description}</div>
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <Calendar className="w-4 h-4" />
                          {formatDate(accrual.accrual_date)}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-lg font-bold ${isPositive ? "text-green-600" : "text-red-600"}`}>
                        {amountLabel}
                      </div>
                      <div className="text-xs text-gray-500">{accrual.order_id}</div>
                    </div>
                  </div>
                </div>
              );
            })}
            {loading && <p className="text-gray-600">Загрузка истории...</p>}
            {!loading && xpHistory.length === 0 && (
              <p className="text-gray-600 text-center py-4">История начислений пуста</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
