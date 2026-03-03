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
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Комиссии и уровни</h1>
        <p className="text-gray-600">Управление комиссионной моделью для продавцов</p>
      </div>

      <div className="space-y-4">
        {tiers.map((tier, index) => (
          <div
            key={tier.id}
            className="p-6 bg-white rounded-2xl border-2 border-gray-200 hover:border-gray-400 transition-all"
          >
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-500 rounded-xl flex items-center justify-center text-white font-bold">
                    {index + 1}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">{tier.name}</h3>
                    <p className="text-sm text-gray-600">{tier.description}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
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

              <div className="flex md:flex-col gap-2">
                {editingTier === tier.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={editedRate}
                      onChange={(event) => setEditedRate(event.target.value)}
                      className="w-24 px-2 py-2 border border-gray-300 rounded-lg"
                    />
                    <button onClick={() => void saveEdit(tier)} className="px-3 py-2 bg-black text-white rounded-lg">
                      OK
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => startEdit(tier)}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-black text-white rounded-xl hover:bg-gray-900 transition-all text-sm font-medium"
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
