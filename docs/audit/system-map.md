# System Map

Date: 2026-04-18

## 1. Runtime Topology

- Frontend: Vite + React (`frontend/src`)
- Backend: Express + Prisma (`backend/src`)
- DB: PostgreSQL via Prisma schema (`backend/prisma/schema.prisma`)

## 2. Backend Module Map

| Module file | Mounted prefix | LOC | Endpoints |
|---|---|---:|---:|
| `auth.routes.ts` | `/api/auth` | 196 | 3 |
| `catalog.routes.ts` | `/api/catalog` | 1298 | 9 |
| `profile.routes.ts` | `/api/profile` | 4027 | 20 |
| `partner.routes.ts` | `/api/partner` | 1793 | 13 |
| `admin.routes.ts` | `/api/admin` | 1179 | 10 |
| `admin.complaints.routes.ts` | `/api/admin` | 2077 | 9 |

Total backend endpoints in module files: `64`

## 3. Prisma Model Usage by Module

| Module | Prisma models referenced |
|---|---|
| `auth` | `appUser` |
| `catalog` | `catalogCategory`, `marketplaceListing`, `listingQuestion`, `complaint`, `listingReview`, `marketOrderItem`, `wishlistItem`, `notification`, `appUser` |
| `profile` | `appUser`, `userAddress`, `marketOrder`, `marketplaceListing`, `wishlistItem`, `listingReview`, `partnershipRequest`, `notification` |
| `partner` | `appUser`, `catalogCategory`, `catalogSubcategory`, `catalogItem`, `marketplaceListing`, `marketOrder`, `listingQuestion` |
| `admin (core)` | `platformTransaction`, `auditLog`, `kycRequest`, `marketplaceListing`, `appUser`, `commissionTier`, `complaint`, `complaintSanction` |
| `admin (complaints)` | `complaint`, `complaintSanction`, `auditLog`, `adminIdempotencyKey` |

## 4. Frontend Map (High Level)

### Core Navigation

- Route parsing and path building: `frontend/src/lib/app-routing.ts`
- Root coordinator and view state: `frontend/src/App.tsx`

### Major Feature Pages

- Buyer/profile super-page: `components/pages/ProfilePage.tsx`
- Checkout flow: `components/CheckoutPage.tsx`
- Product page: `components/ProductDetail.tsx`
- Seller storefront: `components/SellerStorePage.tsx`
- Partner listings/orders: `components/pages/PartnerListingsPage.tsx`, `components/pages/PartnerOrdersPage.tsx`
- Admin panel pages under `components/admin/*`

## 5. API Contract Coupling

- Frontend unique API paths detected: `51`
- Backend endpoints detected: `56`
- Frontend paths unmapped to backend patterns: `0` (pattern-level check)

Notes:

- There are backend routes not called directly in current frontend flows (legacy/back-compat/system hooks), especially in complaints and webhook paths.
- This is expected but should be explicitly classified later as:
  - active via UI
  - internal/system
  - legacy compatibility

## 6. Data Domain Map

### Identity and access

- `AppUser`, `SellerProfile`, `UserAddress`, `Notification`

### Catalog and listing lifecycle

- `CatalogCategory`, `CatalogSubcategory`, `CatalogItem`, `MarketplaceListing`, `ListingImage`, `ListingAttribute`

### Commerce

- `MarketOrder`, `MarketOrderItem`, `PlatformTransaction`, `OrderStatusHistory`

### Trust and moderation

- `Complaint`, `ComplaintEvent`, `ComplaintSanction`, `KycRequest`, `AuditLog`, `AdminIdempotencyKey`

### Growth/partnership

- `CommissionTier`, `PartnershipRequest`, `WishlistItem`, `ListingQuestion`, `ListingReview`

## 7. Structural Observations

1. Domain boundaries are present but not fully enforced at file level (still large route files).
2. `profile` and `admin complaints` are the main decomposition targets.
3. UI↔API coupling is direct and mostly consistent; next stage should formalize scenario coverage per role.

