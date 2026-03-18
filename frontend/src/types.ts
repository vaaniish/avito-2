export interface Product {
  id: string;
  title: string;
  price: number;
  image: string;
  rating: number;
  seller: string;
  category: string;
  sku?: string; // Article/SKU number
  isNew?: boolean;
  isSale?: boolean;
  salePrice?: number;
  isVerified?: boolean;
  description?: string;
  shippingBySeller?: boolean;
  reviews?: Review[];
  images?: string[];
  location?: string; // Location of seller
  publishDate?: string; // Publication/update date
  views?: number; // Number of views
  specifications?: { [key: string]: string }; // Product-specific specifications
  isPriceLower?: boolean; // Price lower than market
  sellerResponseTime?: string; // Average response time
  sellerAvatar?: string; // Seller avatar
  sellerListings?: number; // Number of seller listings
  breadcrumbs?: string[]; // Category breadcrumbs
  condition?: "new" | "used"; // Condition: new or used
  city?: string; // City name where item is located
}

export interface Review {
  id: string;
  author: string;
  rating: number;
  date: string;
  comment: string;
  avatar?: string;
}

export interface CartItem extends Product {
  quantity: number;
}

export interface FilterState {
  categories: string[];
  priceRange: [number, number];
  minRating: number;
  searchQuery: string;
  showOnlySale?: boolean; // New filter for sale items
  condition?: "all" | "new" | "used"; // Filter by condition
  includeWords?: string; // Words that MUST be present (разрешенные слова)
  excludeWords?: string; // Words that MUST NOT be present (запрещенные слова)
}

