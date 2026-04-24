export type UserType = "regular" | "partner";

export type ProfileTab =
  | "profile"
  | "addresses"
  | "orders"
  | "wishlist"
  | "partnership"
  | "partner-listings"
  | "partner-questions"
  | "partner-orders";

export interface ProfilePageProps {
  onBack: () => void;
  onLogout: () => void;
  userType: UserType;
  initialTab?: ProfileTab;
  onTabChange?: (tab: ProfileTab) => void;
  onWishlistUpdate?: (productId: string, isWishlisted: boolean) => void;
  onOpenListing?: (listingPublicId: string) => void;
}

export type ProfileUser = {
  id: number;
  public_id: string;
  role: "regular" | "partner" | "admin";
  firstName: string;
  lastName: string;
  displayName: string;
  name: string;
  email: string;
  avatar?: string | null;
  city?: string | null;
  joinDate: string;
};

export type Address = {
  id: string;
  name: string;
  label: string;
  fullAddress: string;
  region: string;
  city: string;
  street: string;
  house: string;
  apartment: string;
  entrance: string;
  building: string;
  postalCode: string;
  lat: number | null;
  lon: number | null;
  isDefault: boolean;
};

export type AddressSuggestionOption = {
  label: string;
  value: string;
  postalCode?: string;
  region?: string;
  city?: string;
  street?: string;
  house?: string;
  apartment?: string;
  entrance?: string;
  lat?: number | null;
  lon?: number | null;
  formatted?: string;
};

export type AddressFormState = {
  name: string;
  fullAddress: string;
  region: string;
  city: string;
  street: string;
  house: string;
  apartment: string;
  entrance: string;
  postalCode: string;
  lat: number | null;
  lon: number | null;
};

export type ProfileFormState = {
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  oldPassword: string;
  newPassword: string;
};

export type OrderItem = {
  id: string;
  listingPublicId: string;
  name: string;
  image: string;
  price: number;
  quantity: number;
};

export type Order = {
  id: string;
  orderNumber: string;
  date: string;
  status: "processing" | "completed" | "cancelled" | "shipped";
  total: number;
  deliveryDate: string;
  deliveryAddress: string;
  deliveryCost: number;
  discount: number;
  seller: {
    name: string;
    avatar?: string | null;
    phone?: string;
    address?: string;
    workingHours?: string;
  };
  items: OrderItem[];
};

export type WishlistItem = {
  id: string;
  name: string;
  price: number;
  image: string;
  location?: string;
  condition?: "new" | "used";
  seller: string;
  addedDate: string;
};

export type ProfilePayload = {
  user: ProfileUser;
  addresses: Address[];
  orders: Order[];
  wishlist: WishlistItem[];
};

export type ProfileUpdateResponse = {
  success: boolean;
  user: {
    id: number;
    public_id: string;
    role: "regular" | "partner" | "admin";
    firstName: string;
    lastName: string;
    displayName: string;
    email: string;
  };
};

export type PartnershipForm = {
  sellerType: "company" | "ip" | "brand" | "admin_approved";
  name: string;
  email: string;
  contact: string;
  link: string;
  category: string;
  inn: string;
  geography: string;
  socialProfile: string;
  credibility: string;
  whyUs: string;
};
