import React, { Suspense, lazy, useEffect, useState } from "react";
import {
  AlertTriangle,
  ClipboardList,
  CreditCard,
  FileText,
  LogOut,
  Menu,
  TrendingUp,
  UserCheck,
  Users,
  X,
} from "lucide-react";
const TransactionsPage = lazy(() =>
  import("./TransactionsPage").then((module) => ({ default: module.TransactionsPage })),
);
const ComplaintsPage = lazy(() =>
  import("./ComplaintsPage").then((module) => ({ default: module.ComplaintsPage })),
);
const SellersPage = lazy(() =>
  import("./SellersPage").then((module) => ({ default: module.SellersPage })),
);
const ListingsPage = lazy(() =>
  import("./ListingsPage").then((module) => ({ default: module.ListingsPage })),
);
const UsersPage = lazy(() =>
  import("./UsersPage").then((module) => ({ default: module.UsersPage })),
);
const CommissionsPage = lazy(() =>
  import("./CommissionsPage").then((module) => ({ default: module.CommissionsPage })),
);
const AuditLogsPage = lazy(() =>
  import("./AuditLogsPage").then((module) => ({ default: module.AuditLogsPage })),
);

export type AdminPage =
  | "transactions"
  | "complaints"
  | "sellers"
  | "listings"
  | "users"
  | "commissions"
  | "audit";

interface AdminPanelProps {
  onLogout: () => void;
  initialPage?: AdminPage;
  onPageChange?: (page: AdminPage) => void;
}

export function AdminPanel({
  onLogout,
  initialPage = "transactions",
  onPageChange,
}: AdminPanelProps) {
  const [currentPage, setCurrentPage] = useState<AdminPage>(initialPage);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    setCurrentPage((prev) => (prev === initialPage ? prev : initialPage));
  }, [initialPage]);

  useEffect(() => {
    onPageChange?.(currentPage);
  }, [currentPage, onPageChange]);

  const navigation = [
    {
      id: "transactions" as AdminPage,
      name: "Сделки",
      icon: CreditCard,
      description: "Финансы и статусы",
    },
    {
      id: "complaints" as AdminPage,
      name: "Жалобы",
      icon: AlertTriangle,
      description: "Проверка нарушений",
    },
    {
      id: "sellers" as AdminPage,
      name: "Продавцы / KYC",
      icon: UserCheck,
      description: "Верификация продавцов",
    },
    {
      id: "listings" as AdminPage,
      name: "Объявления",
      icon: FileText,
      description: "Модерация карточек",
    },
    {
      id: "users" as AdminPage,
      name: "Пользователи",
      icon: Users,
      description: "Статусы аккаунтов",
    },
    {
      id: "commissions" as AdminPage,
      name: "Комиссии",
      icon: TrendingUp,
      description: "Уровни и ставки",
    },
    {
      id: "audit" as AdminPage,
      name: "Аудит",
      icon: ClipboardList,
      description: "Логи действий админа",
    },
  ];

  const renderPage = () => {
    switch (currentPage) {
      case "transactions":
        return <TransactionsPage />;
      case "complaints":
        return <ComplaintsPage />;
      case "sellers":
        return <SellersPage />;
      case "listings":
        return <ListingsPage />;
      case "users":
        return <UsersPage />;
      case "commissions":
        return <CommissionsPage />;
      case "audit":
        return <AuditLogsPage />;
      default:
        return <TransactionsPage />;
    }
  };

  return (
    <div className="min-h-screen app-shell">
      <header className="sticky top-0 z-50 border-b border-slate-300 bg-[rgb(38,83,141)] text-white shadow-sm">
        <div className="flex items-center justify-between px-3 py-3 md:px-6 md:py-4">
          <div className="flex items-center gap-2 md:gap-4">
            <button
              onClick={() => setIsMobileMenuOpen((prev) => !prev)}
              className="rounded-lg p-1.5 transition-all hover:bg-white/10 md:p-2 lg:hidden"
              aria-label="Открыть меню"
            >
              {isMobileMenuOpen ? <X className="h-5 w-5 md:h-6 md:w-6" /> : <Menu className="h-5 w-5 md:h-6 md:w-6" />}
            </button>
            <div>
              <h1 className="text-base font-bold md:text-xl">Панель администратора</h1>
              <p className="hidden text-xs text-white/70 sm:block">Управление маркетплейсом</p>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-sm transition-all hover:bg-white/20 md:gap-2 md:px-4 md:py-2 md:text-base"
          >
            <LogOut className="h-3.5 w-3.5 md:h-4 md:w-4" />
            <span className="hidden sm:inline">Выход</span>
          </button>
        </div>
      </header>

      <div className="flex">
        <aside
          className={`fixed left-0 top-[56px] z-40 h-[calc(100vh-56px)] w-72 overflow-y-auto border-r border-slate-200 bg-white px-2 py-2 transition-transform duration-300 md:top-[72px] md:h-[calc(100vh-72px)] md:w-80 lg:sticky lg:translate-x-0 ${
            isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <nav className="space-y-1.5 p-2 md:space-y-2 md:p-3">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = currentPage === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setCurrentPage(item.id);
                    setIsMobileMenuOpen(false);
                  }}
                  className={`dashboard-nav-btn ${isActive ? "dashboard-nav-btn--active" : ""}`}
                >
                  <Icon className="h-4 w-4 flex-shrink-0 md:h-5 md:w-5" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium md:text-base">{item.name}</div>
                    <div className={`truncate text-xs ${isActive ? "text-white/70" : "text-gray-500"}`}>{item.description}</div>
                  </div>
                </button>
              );
            })}
          </nav>
        </aside>

        {isMobileMenuOpen && (
          <div
            onClick={() => setIsMobileMenuOpen(false)}
            className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          />
        )}

        <main className="w-full min-w-0 flex-1 p-3 md:p-6 lg:p-8">
          <Suspense
            fallback={(
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600">
                Загрузка раздела...
              </div>
            )}
          >
            {renderPage()}
          </Suspense>
        </main>
      </div>
    </div>
  );
}
