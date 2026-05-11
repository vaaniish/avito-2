import { useCallback, useEffect, useState } from "react";
import type { AdminPage } from "../pages/admin/AdminPanel";
import type { ProfileTab } from "../pages/profile/profile.models";
import { notifyError } from "../shared/ui/notifications";
import {
  apiDelete,
  apiPost,
  clearSessionUser,
  getSessionToken,
  getSessionUser,
  saveSessionUser,
  type SessionRole,
  type SessionUser,
} from "../shared/lib/api";
import type { AppView } from "./app-routing";
import { logAppDebug } from "./app.debug";

type AuthProfileData = { wishlist: Array<{ id: string }> };

export function useAppSessionState(params: {
  currentView: AppView;
  currentProfileTab: ProfileTab;
  onSetCurrentView: (view: AppView) => void;
  onSetCurrentAdminPage: (page: AdminPage) => void;
}) {
  const { currentProfileTab, currentView, onSetCurrentAdminPage, onSetCurrentView } = params;
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isSessionHydrated, setIsSessionHydrated] = useState(false);
  const [userType, setUserType] = useState<SessionRole>("regular");
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(null);
  const [wishlistProductIds, setWishlistProductIds] = useState(new Set<string>());

  const handleWishlistToggle = useCallback(
    async (productId: string, shouldAddToWishlist: boolean) => {
      try {
        if (shouldAddToWishlist) {
          await apiPost<{ success: boolean }>(`/profile/wishlist/${productId}`);
        } else {
          await apiDelete<{ success: boolean }>(`/profile/wishlist/${productId}`);
        }

        setWishlistProductIds((prev) => {
          const next = new Set(prev);
          if (shouldAddToWishlist) {
            next.add(productId);
          } else {
            next.delete(productId);
          }
          return next;
        });
      } catch (error) {
        console.error("Error toggling wishlist:", error);
        notifyError("Не удалось обновить список избранного");
      }
    },
    [],
  );

  const handleAuthLoginSuccess = useCallback(
    (role: SessionRole, user: SessionUser, profile: AuthProfileData) => {
      saveSessionUser(user);
      setCurrentUser(user);
      setIsAuthenticated(true);
      setUserType(role || "regular");
      setWishlistProductIds(new Set(profile.wishlist.map((item) => item.id)));
      logAppDebug("session", "login-success", { role, currentProfileTab });

      if (role === "admin") {
        onSetCurrentAdminPage("transactions");
        onSetCurrentView("adminPanel");
        return;
      }

      if (currentProfileTab === "partnership") {
        onSetCurrentView("partnership");
        return;
      }

      onSetCurrentView("profile");
    },
    [currentProfileTab, onSetCurrentAdminPage, onSetCurrentView],
  );

  const handleProfileLogout = useCallback(() => {
    clearSessionUser();
    setCurrentUser(null);
    setIsAuthenticated(false);
    setUserType("regular");
    setWishlistProductIds(new Set());
    onSetCurrentAdminPage("transactions");
    onSetCurrentView("auth");
  }, [onSetCurrentAdminPage, onSetCurrentView]);

  const handleAdminLoginSuccess = useCallback(
    (user?: SessionUser) => {
      if (user) {
        saveSessionUser(user);
        setCurrentUser(user);
        setIsAuthenticated(true);
        setUserType(user.role);
      }
      onSetCurrentAdminPage("transactions");
      onSetCurrentView("adminPanel");
    },
    [onSetCurrentAdminPage, onSetCurrentView],
  );

  const handleAdminLogout = useCallback(() => {
    clearSessionUser();
    setCurrentUser(null);
    setIsAuthenticated(false);
    setUserType("regular");
    setWishlistProductIds(new Set());
    onSetCurrentAdminPage("transactions");
    onSetCurrentView("auth");
  }, [onSetCurrentAdminPage, onSetCurrentView]);

  useEffect(() => {
    const existingSession = getSessionUser();
    const existingToken = getSessionToken();
    if (!existingSession || !existingToken) {
      if (existingSession && !existingToken) {
        clearSessionUser();
      }
      logAppDebug("session", "hydrate-empty", {
        hasSession: Boolean(existingSession),
        hasToken: Boolean(existingToken),
      });
      setIsSessionHydrated(true);
      return;
    }

    setCurrentUser(existingSession);
    setUserType(existingSession.role);
    setIsAuthenticated(true);
    setIsSessionHydrated(true);
    logAppDebug("session", "hydrate-passive", {
      role: existingSession.role,
      currentView,
    });
  }, [currentView]);

  useEffect(() => {
    if (!isSessionHydrated) {
      return;
    }

    if (currentView === "adminPanel") {
      if (!isAuthenticated || userType !== "admin") {
        logAppDebug("session", "guard-admin-login", {
          isAuthenticated,
          userType,
        });
        onSetCurrentView("adminLogin");
      }
      return;
    }

    if (
      (currentView === "profile" ||
        currentView === "partnerListingCreate" ||
        (currentView === "partnership" && currentProfileTab === "partnership") ||
        currentView === "cart" ||
        currentView === "checkout") &&
      !isAuthenticated
    ) {
      logAppDebug("session", "guard-auth", {
        currentView,
        currentProfileTab,
      });
      onSetCurrentView("auth");
    }
  }, [
    currentProfileTab,
    currentView,
    isAuthenticated,
    isSessionHydrated,
    onSetCurrentView,
    userType,
  ]);

  return {
    currentUser,
    isAuthenticated,
    isSessionHydrated,
    userType,
    wishlistProductIds,
    handleWishlistToggle,
    handleAuthLoginSuccess,
    handleProfileLogout,
    handleAdminLoginSuccess,
    handleAdminLogout,
  };
}
