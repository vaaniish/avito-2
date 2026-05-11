import { useCallback, useEffect, useState } from "react";
import { apiDelete, apiGet, apiPatch } from "../../shared/lib/api";
import { notifyError, notifySuccess } from "../../shared/ui/notifications";
import type {
  Address,
  Order,
  ProfileFormState,
  ProfilePageProps,
  ProfilePayload,
  ProfileUpdateResponse,
  ProfileUser,
  WishlistItem,
} from "./profile.models";

export function useProfileData(params: {
  onWishlistUpdate?: ProfilePageProps["onWishlistUpdate"];
}) {
  const [isLoading, setIsLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileUser | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [wishlistItems, setWishlistItems] = useState<WishlistItem[]>([]);
  const [saveLoading, setSaveLoading] = useState(false);
  const [profileForm, setProfileForm] = useState<ProfileFormState>({
    firstName: "",
    lastName: "",
    displayName: "",
    email: "",
    oldPassword: "",
    newPassword: "",
  });

  const loadProfile = useCallback(async (showGlobalLoader = false) => {
    if (showGlobalLoader) {
      setIsLoading(true);
    }
    try {
      const data = await apiGet<ProfilePayload>("/profile/me");
      setProfile(data.user);
      setAddresses(data.addresses);
      setOrders(data.orders);
      setWishlistItems(data.wishlist);
      setProfileForm({
        firstName: data.user.firstName || "",
        lastName: data.user.lastName || "",
        displayName: data.user.displayName || data.user.name || "",
        email: data.user.email,
        oldPassword: "",
        newPassword: "",
      });
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось загрузить профиль");
    } finally {
      if (showGlobalLoader) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadProfile(true);
  }, [loadProfile]);

  const saveProfile = useCallback(async () => {
    setSaveLoading(true);
    try {
      const payload: Record<string, string> = {
        firstName: profileForm.firstName,
        lastName: profileForm.lastName,
        displayName: profileForm.displayName,
        email: profileForm.email,
      };

      if (profileForm.newPassword) {
        payload.oldPassword = profileForm.oldPassword;
        payload.newPassword = profileForm.newPassword;
      }

      const updateResponse = await apiPatch<ProfileUpdateResponse>("/profile/me", payload);
      if (!updateResponse.success) {
        throw new Error("Не удалось обновить профиль");
      }
      await loadProfile();
      notifySuccess("Профиль обновлен");
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось сохранить профиль");
    } finally {
      setSaveLoading(false);
    }
  }, [loadProfile, profileForm]);

  const removeWishlistItem = useCallback(
    async (id: string) => {
      try {
        await apiDelete<{ success: boolean }>(`/profile/wishlist/${id}`);
        setWishlistItems((prev) => prev.filter((item) => item.id !== id));
        params.onWishlistUpdate?.(id, false);
      } catch (error) {
        notifyError(error instanceof Error ? error.message : "Не удалось удалить из избранного");
      }
    },
    [params],
  );

  return {
    addresses,
    isLoading,
    orders,
    profile,
    profileForm,
    saveLoading,
    wishlistItems,
    loadProfile,
    removeWishlistItem,
    saveProfile,
    setAddresses,
    setOrders,
    setProfile,
    setProfileForm,
    setWishlistItems,
  };
}
