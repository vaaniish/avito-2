import { useCallback, useEffect, useState } from "react";
import type { AdminPage } from "../pages/admin/AdminPanel";
import type { ProfileTab } from "../pages/profile/profile.models";
import { notifyError } from "../shared/ui/notifications";
import {
  apiGet,
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
type SessionBootstrapResponse = {
  user: SessionUser;
  profile?: AuthProfileData;
};
type WishlistBootstrapItem = { id: string };

const WISHLIST_STORAGE_KEY = "ecomm_session_wishlist_ids";

function saveWishlistIds(ids: Iterable<string>) {
  localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(Array.from(new Set(ids))));
}

function loadWishlistIds() {
  const raw = localStorage.getItem(WISHLIST_STORAGE_KEY);
  if (!raw) return new Set<string>();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set<string>();
    return new Set(
      parsed
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean),
    );
  } catch {
    return new Set<string>();
  }
}

function clearWishlistIds() {
  localStorage.removeItem(WISHLIST_STORAGE_KEY);
}

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
          saveWishlistIds(next);
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
      const nextWishlistIds = new Set(profile.wishlist.map((item) => item.id));
      saveWishlistIds(nextWishlistIds);
      setWishlistProductIds(nextWishlistIds);
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
    clearWishlistIds();
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
    clearWishlistIds();
    onSetCurrentAdminPage("transactions");
    onSetCurrentView("auth");
  }, [onSetCurrentAdminPage, onSetCurrentView]);

  useEffect(() => {
    let ignore = false;

    const hydrateSession = async () => {
      const existingSession = getSessionUser();
      const existingToken = getSessionToken();
      if (!existingSession || !existingToken) {
        if (existingSession && !existingToken) {
          clearSessionUser();
        }
        if (!ignore) {
          setWishlistProductIds(new Set());
          clearWishlistIds();
          logAppDebug("session", "hydrate-empty", {
            hasSession: Boolean(existingSession),
            hasToken: Boolean(existingToken),
          });
          setIsSessionHydrated(true);
        }
        return;
      }

      if (!ignore) {
        setCurrentUser(existingSession);
        setUserType(existingSession.role);
        setIsAuthenticated(true);
        setWishlistProductIds(loadWishlistIds());
      }

      try {
        const response = await apiGet<SessionBootstrapResponse>("/auth/me");
        if (ignore) return;

        let wishlistIds: string[];
        if (Array.isArray(response.profile?.wishlist)) {
          wishlistIds = response.profile.wishlist.map((item) => item.id);
        } else {
          const wishlist = await apiGet<WishlistBootstrapItem[]>("/profile/wishlist");
          if (ignore) return;
          wishlistIds = wishlist.map((item) => item.id);
        }

        saveSessionUser(response.user);
        setCurrentUser(response.user);
        setUserType(response.user.role);
        setIsAuthenticated(true);
        const nextWishlistIds = new Set(wishlistIds);
        saveWishlistIds(nextWishlistIds);
        setWishlistProductIds(nextWishlistIds);
        logAppDebug("session", "hydrate-verified", {
          role: response.user.role,
        });
      } catch (error) {
        if (ignore) return;
        logAppDebug("session", "hydrate-bootstrap-failed-keep-local-session", {
          message: error instanceof Error ? error.message : "unknown-error",
        });
      } finally {
        if (!ignore) {
          setIsSessionHydrated(true);
        }
      }
    };

    void hydrateSession();

    return () => {
      ignore = true;
    };
  }, []);

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
