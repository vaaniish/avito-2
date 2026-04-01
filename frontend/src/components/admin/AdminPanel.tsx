import React, { Suspense, lazy, useEffect, useState } from "react";
import {
  AlertTriangle,
  ClipboardList,
  CreditCard,
  FileText,
  LogOut,
  TrendingUp,
  UserCheck,
  Users,
} from "lucide-react";

const TransactionsPage = lazy(() =>
  import("./TransactionsPage").then((module) => ({
    default: module.TransactionsPage,
  })),
);
const ComplaintsPage = lazy(() =>
  import("./ComplaintsPage").then((module) => ({
    default: module.ComplaintsPage,
  })),
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
  import("./CommissionsPage").then((module) => ({
    default: module.CommissionsPage,
  })),
);
const AuditLogsPage = lazy(() =>
  import("./AuditLogsPage").then((module) => ({
    default: module.AuditLogsPage,
  })),
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
  onBack?: () => void;
  initialPage?: AdminPage;
  onPageChange?: (page: AdminPage) => void;
  userName?: string;
  userEmail?: string;
}

export function AdminPanel({
  onLogout,
  onBack,
  initialPage = "transactions",
  onPageChange,
  userName,
  userEmail,
}: AdminPanelProps) {
  const [currentPage, setCurrentPage] = useState<AdminPage>(initialPage);

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
    },
    {
      id: "complaints" as AdminPage,
      name: "Жалобы",
      icon: AlertTriangle,
    },
    {
      id: "sellers" as AdminPage,
      name: "Продавцы / KYC",
      icon: UserCheck,
    },
    {
      id: "listings" as AdminPage,
      name: "Объявления",
      icon: FileText,
    },
    {
      id: "users" as AdminPage,
      name: "Пользователи",
      icon: Users,
    },
    {
      id: "commissions" as AdminPage,
      name: "Комиссии",
      icon: TrendingUp,
    },
    {
      id: "audit" as AdminPage,
      name: "Аудит",
      icon: ClipboardList,
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

  const resolvedName = userName?.trim() || "Администратор";
  const resolvedEmail = userEmail?.trim() || "admin@ecomm.local";

  return (
    <div className="min-h-screen app-shell pb-10 pt-24 md:pb-16 md:pt-28">
      <div className="page-container">
        <section className="dashboard-card mb-4 p-4 md:mb-6 md:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h1 className="dashboard-title">Панель администратора</h1>
              <p className="dashboard-subtitle break-words">
                {resolvedName} • {resolvedEmail}
              </p>
            </div>
            {onBack ? (
              <button onClick={onBack} className="back-link text-sm">
                ← На главную
              </button>
            ) : null}
          </div>
        </section>

        <div className="flex flex-col gap-5 lg:flex-row lg:gap-6">
          <aside className="dashboard-sidebar h-fit p-4 lg:w-80 lg:shrink-0">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 text-gray-500">
                <UserCheck className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-semibold">{resolvedName}</div>
                <div className="text-xs text-gray-500">Админ-панель Ecomm</div>
              </div>
            </div>

            <div className="dashboard-sidebar__section mb-4">
              <p className="dashboard-sidebar__title">Разделы</p>
              <div className="dashboard-nav-list">
                {navigation.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setCurrentPage(item.id)}
                      className={`dashboard-nav-btn ${
                        currentPage === item.id
                          ? "dashboard-nav-btn--active"
                          : ""
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {item.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              onClick={onLogout}
              className="btn-secondary flex w-full items-center justify-center gap-2 px-3 py-2 text-sm text-gray-700"
            >
              <LogOut className="h-4 w-4" /> Выйти
            </button>
          </aside>

          <main className="dashboard-sidebar min-w-0 flex-1 p-4 md:p-6">
            <Suspense
              fallback={
                <div className="dashboard-empty">Загрузка раздела...</div>
              }
            >
              {renderPage()}
            </Suspense>
          </main>
        </div>
      </div>
    </div>
  );
}
