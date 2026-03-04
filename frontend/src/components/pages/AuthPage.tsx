import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { apiPost, type SessionRole, type SessionUser } from "../../lib/api";

interface AuthPageProps {
  onBack: () => void;
  onPartnershipClick: () => void;
  onLoginSuccess?: (userType?: SessionRole, user?: SessionUser) => void;
}

type AuthResponse = {
  user: SessionUser;
};

const DEMO_CREDENTIALS = {
  regular: { email: "demo@ecomm.ru", password: "demo123" },
  partner: { email: "partner@ecomm.ru", password: "partner123" },
  admin: { email: "admin@ecomm.ru", password: "admin123" },
};

export function AuthPage({ onBack, onPartnershipClick, onLoginSuccess }: AuthPageProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    username: "",
    email: "",
    password: "",
    agreeToTerms: false,
    rememberMe: false,
  });

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);

    try {
      if (isSignUp) {
        const response = await apiPost<AuthResponse>("/auth/signup", {
          name: formData.name.trim(),
          username: formData.username.trim(),
          email: formData.email.trim(),
          password: formData.password,
        });

        alert("Регистрация успешна");
        onLoginSuccess?.(response.user.role, response.user);
        onBack();
      } else {
        const response = await apiPost<AuthResponse>("/auth/login", {
          email: formData.email.trim(),
          password: formData.password,
        });

        onLoginSuccess?.(response.user.role, response.user);
        onBack();
      }

      setFormData({
        name: "",
        username: "",
        email: "",
        password: "",
        agreeToTerms: false,
        rememberMe: false,
      });
    } catch (error) {
      alert(error instanceof Error ? error.message : "Ошибка авторизации");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen app-shell relative flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white/95 p-6 shadow-xl sm:p-8 md:p-10">
        <button
          onClick={onBack}
          className="back-link mb-4 block w-full text-left text-sm"
        >
          ← На главную
        </button>

        <div className="mb-6 flex gap-2 rounded-xl border border-slate-200 bg-slate-100 p-[3px]">
          <button
            type="button"
            onClick={() => setIsSignUp(false)}
            className={`flex-1 rounded-lg py-3 text-sm transition-all duration-300 sm:text-base ${
              !isSignUp ? "bg-white text-black shadow-sm" : "bg-transparent text-gray-600 hover:text-black"
            }`}
          >
            Вход
          </button>
          <button
            type="button"
            onClick={() => setIsSignUp(true)}
            className={`flex-1 rounded-lg py-3 text-sm transition-all duration-300 sm:text-base ${
              isSignUp ? "bg-white text-black shadow-sm" : "bg-transparent text-gray-600 hover:text-black"
            }`}
          >
            Регистрация
          </button>
        </div>

        <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
          {isSignUp && (
            <input
              type="text"
              required
              value={formData.name}
              onChange={(event) => setFormData({ ...formData, name: event.target.value })}
              placeholder="Ваше имя"
              className="field-control"
            />
          )}

          {isSignUp && (
            <input
              type="text"
              required
              value={formData.username}
              onChange={(event) => setFormData({ ...formData, username: event.target.value })}
              placeholder="Имя пользователя"
              className="field-control"
            />
          )}

          <input
            type="email"
            required
            value={formData.email}
            onChange={(event) => setFormData({ ...formData, email: event.target.value })}
            placeholder="Email"
            className="field-control"
          />

          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              required
              value={formData.password}
              onChange={(event) => setFormData({ ...formData, password: event.target.value })}
              placeholder="Пароль"
              className="field-control pr-12"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="btn-primary w-full py-3 disabled:bg-gray-400"
          >
            {isLoading ? "Подождите..." : isSignUp ? "Зарегистрироваться" : "Войти"}
          </button>
        </form>

        {!isSignUp && (
          <div className="mt-6 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
            <p className="font-semibold text-center">Тестовые данные для входа</p>
            <p>
              Пользователь: <code>{DEMO_CREDENTIALS.regular.email}</code> / <code>{DEMO_CREDENTIALS.regular.password}</code>
            </p>
            <p>
              Партнер: <code>{DEMO_CREDENTIALS.partner.email}</code> / <code>{DEMO_CREDENTIALS.partner.password}</code>
            </p>
            <p>
              Админ: <code>{DEMO_CREDENTIALS.admin.email}</code> / <code>{DEMO_CREDENTIALS.admin.password}</code>
            </p>
          </div>
        )}

        <div className="mt-5 text-center">
          <button onClick={onPartnershipClick} className="text-sm text-[rgb(38,83,141)] hover:text-[rgb(58,103,161)]">
            Стать партнером
          </button>
        </div>
      </div>
    </div>
  );
}
