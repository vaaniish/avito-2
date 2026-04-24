import type { ReactNode } from "react";
import { Header } from "./Header";
import { Footer, type FooterPage } from "./Footer";

export type AppPageShellHeaderProps = {
  isAuthenticated: boolean;
  cartItemCount: number;
  onCartClick: () => void;
  onSearchSubmit: (query: string) => void;
  onLogoClick: () => void;
  onProfileClick: () => void;
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
