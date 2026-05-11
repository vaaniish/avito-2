import type { ReactNode } from "react";
import { Header } from "../widgets/Header";
import { Footer, type FooterPage } from "../widgets/Footer";
import type { CatalogCategory, CatalogItem } from "../widgets/FilterPanel";

export type AppPageShellHeaderProps = {
  isAuthenticated: boolean;
  cartItemCount: number;
  onCartClick: () => void;
  onSearchSubmit: (query: string) => void;
  onLogoClick: () => void;
  onProfileClick: () => void;
  catalogCategories: CatalogCategory[];
  onCatalogItemSelect: (item: CatalogItem) => void;
};

type AppPageShellProps = {
  children: ReactNode;
  onFooterNavigate: (page: FooterPage) => void;
  wrapperClassName?: string;
} & AppPageShellHeaderProps;

export function AppPageShell({
  children,
  onFooterNavigate,
  wrapperClassName,
  isAuthenticated,
  cartItemCount,
  onCartClick,
  onSearchSubmit,
  onLogoClick,
  onProfileClick,
  catalogCategories,
  onCatalogItemSelect,
}: AppPageShellProps) {
  const content = (
    <>
      <Header
        isAuthenticated={isAuthenticated}
        cartItemCount={cartItemCount}
        onCartClick={onCartClick}
        onSearchSubmit={onSearchSubmit}
        onLogoClick={onLogoClick}
        onProfileClick={onProfileClick}
        catalogCategories={catalogCategories}
        onCatalogItemSelect={onCatalogItemSelect}
      />
      {children}
      <Footer onNavigate={onFooterNavigate} />
    </>
  );

  if (!wrapperClassName) {
    return content;
  }

  return <div className={wrapperClassName}>{content}</div>;
}
