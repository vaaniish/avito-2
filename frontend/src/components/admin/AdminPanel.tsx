import React, { useState } from "react";
import {
  CreditCard,
  AlertTriangle,
  UserCheck,
  FileText,
  Users,
  TrendingUp,
  HelpCircle,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { TransactionsPage } from "./TransactionsPage";
import { ComplaintsPage } from "./ComplaintsPage";
import { SellersPage } from "./SellersPage";
import { ListingsPage } from "./ListingsPage";
import { UsersPage } from "./UsersPage";
import { CommissionsPage } from "./CommissionsPage";
import { HelpPage } from "./HelpPage";

type AdminPage =
  | "transactions"
  | "complaints"
  | "sellers"
  | "listings"
  | "users"
  | "commissions"
  | "help";

interface AdminPanelProps {
  onLogout: () => void;
}

export function AdminPanel({ onLogout }: AdminPanelProps) {
  const [currentPage, setCurrentPage] =
    useState<AdminPage>("transactions");
  const [isMobileMenuOpen, setIsMobileMenuOpen] =
    useState(false);

  const navigation = [
    {
      id: "transactions" as AdminPage,
      name: "Сделки",
      icon: CreditCard,
      description: "Комиссионный доход",
    },
    {
      id: "complaints" as AdminPage,
      name: "Жалобы",
      icon: AlertTriangle,
      description: "Контроль нарушений",
    },
    {
      id: "sellers" as AdminPage,
      name: "Продавцы / KYC",
      icon: UserCheck,
      description: "Заявки продавцов",
    },
    {
      id: "listings" as AdminPage,
      name: "Объявления",
      icon: FileText,
      description: "Модерация",
    },
    {
      id: "users" as AdminPage,
      name: "Пользователи",
      icon: Users,
      description: "Управление аккаунтами",
    },
    {
      id: "commissions" as AdminPage,
      name: "Комиссии",
      icon: TrendingUp,
      description: "Пирамида уровней",
    },
    {
      id: "help" as AdminPage,
      name: "Помощь",
      icon: HelpCircle,
      description: "Документация",
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
      case "help":
        return <HelpPage />;
      default:
        return <TransactionsPage />;
    }
  };

  return (
    <div className="min-h-screen app-shell">
      <header className="sticky top-0 z-50 border-b border-slate-300 bg-[rgb(38,83,141)] text-white shadow-sm">
        <div className="px-3 md:px-6 py-3 md:py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 md:gap-4">
            <button
              onClick={() =>
                setIsMobileMenuOpen(!isMobileMenuOpen)
              }
              className="lg:hidden p-1.5 md:p-2 hover:bg-white/10 rounded-lg md:rounded-xl transition-all"
            >
              {isMobileMenuOpen ? (
                <X className="w-5 h-5 md:w-6 md:h-6" />
              ) : (
                <Menu className="w-5 h-5 md:w-6 md:h-6" />
              )}
            </button>
            <div>
              <h1 className="text-base md:text-xl font-bold">
                Ecom Admin Panel
              </h1>
              <p className="text-xs text-gray-400 hidden sm:block">
                Панель управления маркетплейсом
              </p>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 md:gap-2 px-2.5 md:px-4 py-1.5 md:py-2 bg-white/10 hover:bg-white/20 rounded-lg md:rounded-xl transition-all text-sm md:text-base"
          >
            <LogOut className="w-3.5 h-3.5 md:w-4 md:h-4" />
            <span className="hidden sm:inline">Выход</span>
          </button>
        </div>
      </header>

      <div className="flex">
        <aside
          className={`${
            isMobileMenuOpen
              ? "translate-x-0"
              : "-translate-x-full"
          } fixed left-0 top-[56px] z-40 h-[calc(100vh-56px)] w-72 overflow-y-auto border-r border-slate-200 bg-white transition-transform duration-300 md:top-[73px] md:h-[calc(100vh-73px)] md:w-80 lg:sticky lg:translate-x-0`}
        >
          <nav className="p-3 md:p-4 space-y-1.5 md:space-y-2">
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
                  className={`w-full flex items-center gap-2.5 md:gap-3 px-3 md:px-4 py-2.5 md:py-3 rounded-lg md:rounded-xl transition-all text-left ${
                    isActive
                      ? "bg-[rgb(38,83,141)] text-white"
                      : "hover:bg-gray-100 text-gray-700"
                  }`}
                >
                  <Icon className="w-4 h-4 md:w-5 md:h-5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm md:text-base">
                      {item.name}
                    </div>
                    <div
                      className={`text-xs ${
                        isActive
                          ? "text-white/70"
                          : "text-gray-500"
                      }`}
                    >
                      {item.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </nav>
        </aside>

        {isMobileMenuOpen && (
          <div
            onClick={() => setIsMobileMenuOpen(false)}
            className="fixed inset-0 bg-black/50 z-30 lg:hidden top-[56px] md:top-[73px]"
          />
        )}

        <main className="w-full min-w-0 flex-1 p-3 md:p-6 lg:p-8">
          {renderPage()}
        </main>
      </div>
    </div>
  );
}
