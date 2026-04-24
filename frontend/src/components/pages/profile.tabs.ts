import { MapPin, Package, Star, Store, User as UserIcon } from "lucide-react";
import type { ProfileTab } from "./profile.models";

type ProfileTabItem = {
  id: ProfileTab;
  label: string;
  icon: typeof UserIcon;
};

export const regularTabs: ProfileTabItem[] = [
  { id: "profile", label: "Профиль", icon: UserIcon },
  { id: "addresses", label: "Адреса", icon: MapPin },
  { id: "orders", label: "Заказы", icon: Package },
  { id: "wishlist", label: "Избранное", icon: Star },
  { id: "partnership", label: "Партнерство", icon: Store },
] as const;

export const partnerBaseTabs: ProfileTabItem[] = [
  { id: "profile", label: "Профиль", icon: UserIcon },
  { id: "addresses", label: "Адреса", icon: MapPin },
  { id: "orders", label: "Заказы", icon: Package },
  { id: "wishlist", label: "Избранное", icon: Star },
] as const;

export const partnerTabs: ProfileTabItem[] = [
  { id: "partner-listings", label: "Объявления", icon: Store },
  { id: "partner-questions", label: "Вопросы", icon: Package },
  { id: "partner-orders", label: "Заказы", icon: Package },
] as const;
