# UI -> API -> DB Matrix (Baseline)

Date: 2026-04-18  
Scope: high-signal mapping for core end-to-end paths.

## Buyer / Public flows

| UI area | Primary API endpoints | Main DB models touched |
|---|---|---|
| Auth page | `POST /api/auth/signup`, `POST /api/auth/login`, `GET /api/auth/me` | `AppUser` |
| Home/catalog list | `GET /api/catalog/categories`, `GET /api/catalog/listings`, `GET /api/catalog/suggestions` | `CatalogCategory`, `MarketplaceListing`, `CatalogItem`, `WishlistItem` (derived flags) |
| Product page | `GET /api/catalog/listings/:publicId`, `POST /api/catalog/listings/:publicId/view`, `GET/POST /api/catalog/listings/:publicId/questions`, `POST /api/catalog/listings/:publicId/complaints` | `MarketplaceListing`, `ListingImage`, `ListingQuestion`, `Complaint`, `ListingReview`, `MarketOrderItem` |
| Wishlist interactions | `POST /api/profile/wishlist/:listingPublicId`, `DELETE /api/profile/wishlist/:listingPublicId`, `GET /api/profile/wishlist` | `WishlistItem`, `MarketplaceListing` |
| Profile edit | `GET /api/profile/me`, `PATCH /api/profile/me` | `AppUser`, `SellerProfile`, related derived stats |
| Address book | `GET/POST/PATCH/DELETE /api/profile/addresses*`, `POST /api/profile/addresses/:id/default`, `GET /api/profile/location/suggest` | `UserAddress` |
| Checkout/order | `GET /api/profile/delivery-points`, `POST /api/profile/orders`, `GET /api/profile/orders/payment-status` | `MarketOrder`, `MarketOrderItem`, `PlatformTransaction`, `OrderStatusHistory`, `MarketplaceListing` |
| Notifications | `GET /api/profile/notifications`, `PATCH /api/profile/notifications/mark-as-read` | `Notification` |

## Partner flows

| UI area | Primary API endpoints | Main DB models touched |
|---|---|---|
| Partner listings | `GET /api/partner/listings`, `POST /api/partner/listings`, `PATCH /api/partner/listings/:publicId`, `DELETE /api/partner/listings/:publicId`, `POST /api/partner/listings/:publicId/toggle-status` | `MarketplaceListing`, `ListingImage`, `ListingAttribute`, `Catalog*` |
| Listing assist | `GET /api/partner/listings/title-suggestions`, `GET /api/partner/listings/category-guess` | `MarketplaceListing`, `Catalog*` |
| Partner orders | `GET /api/partner/orders`, `PATCH /api/partner/orders/:publicId/status`, `PATCH /api/partner/orders/:publicId/tracking` | `MarketOrder`, `OrderStatusHistory`, `PlatformTransaction` |
| Partner Q&A | `GET /api/partner/questions`, `POST /api/partner/questions/:publicId/answer` | `ListingQuestion`, `Notification` |

## Admin flows

| UI area | Primary API endpoints | Main DB models touched |
|---|---|---|
| Transactions | `GET /api/admin/transactions` | `PlatformTransaction`, `MarketOrder`, `AppUser` |
| Complaints | `GET /api/admin/complaints*`, `PATCH /api/admin/complaints/:id/status` | `Complaint`, `ComplaintEvent`, `ComplaintSanction`, `MarketplaceListing`, `AppUser`, `AdminIdempotencyKey`, `AuditLog` |
| KYC | `GET /api/admin/kyc-requests`, `PATCH /api/admin/kyc-requests/:publicId` | `KycRequest`, `AppUser`, `AuditLog` |
| Listings moderation | `GET /api/admin/listings`, `PATCH /api/admin/listings/:publicId/moderation` | `MarketplaceListing`, `Complaint`, `AppUser`, `AuditLog` |
| Users | `GET /api/admin/users`, `PATCH /api/admin/users/:publicId/status` | `AppUser`, `Complaint`, `ComplaintSanction`, `KycRequest`, `AuditLog` |
| Commissions | `GET /api/admin/commission-tiers`, `PATCH /api/admin/commission-tiers/:publicId` | `CommissionTier`, `SellerProfile`, `AuditLog` |
| Audit | `GET /api/admin/audit-logs` | `AuditLog`, `AppUser` |

## System / Internal paths

| Endpoint | Notes |
|---|---|
| `POST /api/profile/payments/yookassa/webhook` | asynchronous provider callback path |
| legacy complaint endpoints in admin | compatibility surface; should be tagged and governed by deprecation policy |

