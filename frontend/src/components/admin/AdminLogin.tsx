import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { apiPost, type SessionUser } from "../../lib/api";

interface AdminLoginProps {
  onLoginSuccess: (user?: SessionUser) => void;
  onBack: () => void;
}

type AuthResponse = {
  user: SessionUser;
};

export function AdminLogin({ onLoginSuccess, onBack }: AdminLoginProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({ email: "", password: "" });

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);

    try {
      const response = await apiPost<AuthResponse>("/auth/login", formData);
      if (response.user.role !== "admin") {
        alert("Доступ запрещен. Нужны права администратора");
        return;
      }
      onLoginSuccess(response.user);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Ошибка входа");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl border border-gray-200 shadow-xl p-6">
        <button onClick={onBack} className="text-sm text-gray-600 hover:text-black mb-4">
          ← Назад
        </button>

        <h1 className="text-2xl font-bold mb-2">Вход в админ-панель</h1>
        <p className="text-sm text-gray-600 mb-6">Используйте admin@ecomm.ru / admin123</p>

        <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
          <input
            type="email"
            value={formData.email}
            onChange={(event) => setFormData({ ...formData, email: event.target.value })}
            placeholder="Email"
            className="w-full px-4 py-3 rounded-xl border border-gray-300"
            required
          />

          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={formData.password}
              onChange={(event) => setFormData({ ...formData, password: event.target.value })}
              placeholder="Пароль"
              className="w-full px-4 py-3 pr-12 rounded-xl border border-gray-300"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400"
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 bg-[rgb(38,83,141)] hover:bg-[rgb(58,103,161)] disabled:bg-gray-400 text-white rounded-xl"
          >
            {isLoading ? "Входим..." : "Войти"}
          </button>
        </form>
      </div>
    </div>
  );
}
