import {
  ClipboardList,
  Heart,
  History,
  MapPin,
  MessageCircleQuestion,
  Store,
  TrendingUp,
  User as UserIcon,
} from "lucide-react";
import type { ProfileTab } from "./profile.models";

type ProfileTabItem = {
  id: ProfileTab;
  label: string;
  icon: typeof UserIcon;
};

export const regularTabs: ProfileTabItem[] = [
  { id: "profile", label: "Профиль", icon: UserIcon },
  { id: "addresses", label: "Адреса", icon: MapPin },
  { id: "orders", label: "История заказов", icon: History },
  { id: "wishlist", label: "Избранное", icon: Heart },
  { id: "partnership", label: "Партнерство", icon: Store },
] as const;

export const partnerBaseTabs: ProfileTabItem[] = [
  { id: "profile", label: "Профиль", icon: UserIcon },
  { id: "addresses", label: "Адреса", icon: MapPin },
  { id: "orders", label: "История заказов", icon: History },
  { id: "wishlist", label: "Избранное", icon: Heart },
] as const;

export const partnerTabs: ProfileTabItem[] = [
  { id: "partner-listings", label: "Объявления", icon: Store },
  { id: "partner-finance", label: "Финансы", icon: TrendingUp },
  { id: "partner-questions", label: "Вопросы", icon: MessageCircleQuestion },
  { id: "partner-orders", label: "Заказы", icon: ClipboardList },
] as const;
