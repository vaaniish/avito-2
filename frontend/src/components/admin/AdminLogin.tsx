import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { apiPost, saveSessionToken, type SessionUser } from "../../lib/api";
import { notifyError } from "../ui/notifications";

interface AdminLoginProps {
  onLoginSuccess: (user?: SessionUser) => void;
  onBack: () => void;
}

type AuthResponse = {
  user: SessionUser;
  sessionToken?: string;
};

export function AdminLogin({ onLoginSuccess, onBack }: AdminLoginProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [formData, setFormData] = useState({ email: "", password: "" });

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setSubmitError(null);

    try {
      const response = await apiPost<AuthResponse>("/auth/login", formData);
      if (typeof response.sessionToken === "string" && response.sessionToken.trim()) {
        saveSessionToken(response.sessionToken);
      }
      if (response.user.role !== "admin") {
        const message = "Доступ запрещен. Нужны права администратора";
        setSubmitError(message);
        notifyError(message);
        return;
      }
      onLoginSuccess(response.user);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ошибка входа";
      setSubmitError(message);
      notifyError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen app-shell flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <button onClick={onBack} className="back-link mb-4 text-sm">
          ← Назад
        </button>

        <h1 className="text-2xl font-bold mb-2">Вход в админ-панель</h1>
        <p className="text-sm text-gray-600 mb-6">
          Используйте admin@ecomm.local / admin123
        </p>

        <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
          <input
            type="email"
            value={formData.email}
            onChange={(event) => {
              setSubmitError(null);
              setFormData({ ...formData, email: event.target.value });
            }}
            placeholder="Email"
            className="field-control"
            required
          />

          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={formData.password}
              onChange={(event) => {
                setSubmitError(null);
                setFormData({ ...formData, password: event.target.value });
              }}
              placeholder="Пароль"
              className="field-control pr-12"
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
            className="btn-primary w-full py-3 disabled:bg-gray-400"
          >
            {isLoading ? "Входим..." : "Войти"}
          </button>

          {submitError && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {submitError}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
