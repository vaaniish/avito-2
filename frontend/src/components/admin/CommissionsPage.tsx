import React, { useEffect, useState } from "react";
import { Edit, Users } from "lucide-react";
import { apiGet, apiPatch } from "../../lib/api";

type CommissionTier = {
  id: string;
  name: string;
  minSales: number;
  maxSales: number | null;
  commissionRate: number;
  description: string;
  sellersCount: number;
};

export function CommissionsPage() {
  const [tiers, setTiers] = useState<CommissionTier[]>([]);
  const [editingTier, setEditingTier] = useState<string | null>(null);
  const [editedRate, setEditedRate] = useState<string>("");

  const loadTiers = async () => {
    try {
      const result = await apiGet<CommissionTier[]>("/admin/commission-tiers");
      setTiers(result);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Не удалось загрузить комиссии");
    }
  };

  useEffect(() => {
    void loadTiers();
  }, []);

  const formatCurrency = (amount: number | null) => {
    if (amount === null) return "∞";
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency: "RUB",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const startEdit = (tier: CommissionTier) => {
    setEditingTier(tier.id);
    setEditedRate(String(tier.commissionRate));
  };

  const saveEdit = async (tier: CommissionTier) => {
    const nextRate = Number(editedRate);
    if (!Number.isFinite(nextRate) || nextRate <= 0) {
      alert("Введите корректную комиссию");
      return;
    }

    try {
      await apiPatch<{ success: boolean }>(`/admin/commission-tiers/${tier.id}`, {
        commissionRate: nextRate,
      });
      setEditingTier(null);
      await loadTiers();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Не удалось сохранить комиссию");
    }
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="dashboard-title">Комиссии и уровни</h1>
        <p className="dashboard-subtitle">Управление комиссионной моделью для продавцов</p>
      </div>

      <div className="space-y-3 md:space-y-4">
        {tiers.map((tier, index) => (
          <div key={tier.id} className="dashboard-card transition-all hover:border-gray-400 md:p-6">
            <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-start">
              <div className="min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-500 text-sm font-bold text-white md:h-10 md:w-10 md:rounded-xl">
                    {index + 1}
                  </div>
                  <div>
                    <h3 className="text-base font-bold md:text-xl">{tier.name}</h3>
                    <p className="text-xs text-gray-600 md:text-sm">{tier.description}</p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <div className="text-xs text-gray-500 mb-1">Мин. продажи</div>
                    <div className="font-bold text-sm">{formatCurrency(tier.minSales)}</div>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <div className="text-xs text-gray-500 mb-1">Макс. продажи</div>
                    <div className="font-bold text-sm">{formatCurrency(tier.maxSales)}</div>
                  </div>
                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="text-xs text-blue-700 mb-1">Комиссия</div>
                    <div className="font-bold text-lg text-blue-700">{tier.commissionRate}%</div>
                  </div>
                  <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                    <div className="text-xs text-purple-700 mb-1 flex items-center gap-1">
                      <Users className="w-3 h-3" /> Продавцов
                    </div>
                    <div className="font-bold text-lg text-purple-700">{tier.sellersCount}</div>
                  </div>
                </div>
              </div>

              <div className="flex w-full flex-col gap-2 md:w-auto md:self-start">
                {editingTier === tier.id ? (
                  <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center md:w-auto">
                    <input
                      type="number"
                      value={editedRate}
                      onChange={(event) => setEditedRate(event.target.value)}
                      className="dashboard-select sm:w-28"
                    />
                    <button
                      onClick={() => void saveEdit(tier)}
                      className="btn-primary px-3 py-2"
                    >
                      OK
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => startEdit(tier)}
                    className="btn-primary inline-flex w-full items-center justify-center gap-2 px-4 py-2 text-sm sm:w-auto"
                  >
                    <Edit className="w-4 h-4" /> Изменить
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
