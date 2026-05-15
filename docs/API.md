# Tinkuy Saludable API Documentation

## Overview

The Tinkuy Saludable backend is a GraphQL API built with Node.js, Express, Apollo Server, and PostgreSQL. It provides multi-tenant e-commerce functionality including product catalog, shopping cart, orders, and MercadoPago payment integration.

## Base URL

```
http://localhost:4000
```

## Endpoint

### GraphQL Endpoint

```
POST /graphql
Content-Type: application/json
```

All GraphQL operations (queries and mutations) are sent to this single endpoint using HTTP POST with a JSON body.

### Health Check

```
GET /health
```

Returns server health status including database and Redis connectivity.

**Response:**
```json
{
  "status": "ok",
  "database": "connected",
  "redis": "connected",
  "timestamp": "2026-05-15T10:30:00.000Z"
}
```

---

## Authentication

### JWT Bearer Tokens

The API uses JWT (JSON Web Tokens) for authentication. Tokens are obtained through login mutations and must be included in subsequent requests.

**Header Format:**
```
Authorization: Bearer <token>
```

### Token Types

#### Admin/Manager Token
- Signed with `JWT_ADMIN_SECRET`
- Contains: `sub` (user ID), `role` ("admin" | "manager"), `tenantId`, `branchId` (optional)
- Expiration: 24 hours

#### Customer Token
- Signed with `JWT_CUSTOMER_SECRET`
- Contains: `sub` (customer ID), `role` ("customer"), `tenantId`
- Expiration: 7 days

### Tenant Identification

The API is multi-tenant. Requests must identify the tenant via:
1. **JWT Token** - Tenant ID is extracted from the token
2. **Header** - `x-tenant-id: <tenant-slug>`

---

## Rate Limiting

Rate limits are enforced using Redis (with in-memory fallback in development).

| Type | Window | Max Requests |
|------|--------|--------------|
| General | 60 seconds | 100 |
| Auth | 15 minutes | 10 |
| Checkout | 60 seconds | 10 |

**Response when rate limited (429):**
```json
{
  "error": "Rate limit exceeded"
}
```

---

## Error Handling

### Error Response Format

All GraphQL errors follow a consistent format:

```json
{
  "errors": [
    {
      "message": "Error description",
      "extensions": {
        "code": "ERROR_CODE",
        "statusCode": 400
      }
    }
  ],
  "data": null
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHENTICATED` | 401 | Missing or invalid token |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `VALIDATION_ERROR` | 400 | Invalid input data |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Duplicate resource |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_SERVER_ERROR` | 500 | Server error |

---

## API Reference

### Authentication Module (`auth`)

#### Queries

##### `me` - Get Current User

Returns the currently authenticated user.

**Auth:** Required (admin, manager, or customer)

**Response:** `AuthUser`

```json
{
  "data": {
    "me": {
      "id": "user-123",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "role": "customer",
      "tenantId": "tenant-abc"
    }
  }
}
```

---

#### Mutations

##### `adminLogin` - Admin/Manager Login

**Arguments:**
```graphql
input AdminLoginInput {
  email: String!
  password: String!
  tenantId: String!
}
```

**Response:** `AdminAuthResult`
```graphql
{
  token: String
  user: AuthUser
}
```

**Example:**
```json
{
  "query": "mutation { adminLogin(input: { email: \"admin@example.com\", password: \"secret\", tenantId: \"my-tenant\" }) { token user { id email role } } }"
}
```

---

##### `customerLogin` - Customer Login

**Arguments:**
```graphql
input CustomerLoginInput {
  email: String!
  password: String!
  tenantId: String!
}
```

**Response:** `CustomerAuthResult`
```graphql
{
  token: String
  customer: CustomerAuthUser
}
```

---

##### `customerRegister` - Customer Registration

**Arguments:**
```graphql
input CustomerRegisterInput {
  email: String!
  password: String!  # 8-128 characters
  firstName: String!
  lastName: String!
  phone: String
  tenantId: String!
}
```

**Response:** `CustomerAuthResult`

---

##### `changePassword` - Change Password

**Auth:** Required

**Arguments:**
```graphql
input ChangePasswordInput {
  oldPassword: String!
  newPassword: String!  # 8-128 characters
}
```

**Response:** `Boolean`

---

### Tenant Module (`tenants`)

#### Types

##### `Tenant`
```graphql
{
  id: ID!
  name: String!
  slug: String!
  isActive: Boolean!
  createdAt: DateTime!
  updatedAt: DateTime!
  branches: [Branch!]!
}
```

##### `Branch`
```graphql
{
  id: ID!
  name: String!
  address: String
  phone: String
  isActive: Boolean!
  createdAt: DateTime!
  updatedAt: DateTime!
  tenant: Tenant!
}
```

---

#### Queries

##### `tenants` - List All Tenants

**Auth:** Admin only

**Arguments:**
- `take: Int` (default: 20)
- `skip: Int` (default: 0)

**Response:** `TenantList`
```graphql
{
  items: [Tenant!]!
  count: Int!
}
```

---

##### `tenant` - Get Tenant by Slug

**Auth:** Public

**Arguments:**
- `slug: String!`

**Response:** `Tenant`

---

##### `branches` - List Branches

**Auth:** Manager+

**Arguments:**
- `take: Int` (default: 50)
- `skip: Int` (default: 0)

**Response:** `[Branch!]!`

---

#### Mutations

##### `createTenant` - Create Tenant

**Auth:** Admin

**Arguments:**
```graphql
input CreateTenantInput {
  name: String!
  slug: String!
  branchName: String
}
```

**Response:** `Tenant`

---

##### `updateTenant` - Update Tenant

**Auth:** Admin (own tenant only)

**Arguments:**
```graphql
input UpdateTenantInput {
  name: String
  isActive: Boolean
}
```

**Response:** `Tenant`

---

##### `createBranch` - Create Branch

**Auth:** Manager

**Arguments:**
```graphql
input CreateBranchInput {
  tenantId: String!
  name: String!
  address: String
  phone: String
}
```

**Response:** `Branch`

---

##### `updateBranch` - Update Branch

**Auth:** Manager

**Arguments:**
```graphql
input UpdateBranchInput {
  name: String
  address: String
  phone: String
  isActive: Boolean
}
```

**Response:** `Branch`

---

### Catalog Module (`catalog`)

#### Types

##### `Product`
```graphql
{
  id: ID!
  name: String!
  slug: String!
  description: String
  sku: String
  isActive: Boolean!
  isVisible: Boolean!
  basePrice: Decimal!
  stock(branchId: String): Int
  variants: [ProductVariant!]!
  attributes: [ProductAttribute!]!
  images: [ProductImage!]!
  tags: [ProductTag!]!
  suppliers: [ProductSupplier!]!
  createdAt: DateTime!
  updatedAt: DateTime!
}
```

##### `ProductVariant`
```graphql
{
  id: ID!
  sku: String!
  name: String!
  price: Decimal!
  isActive: Boolean!
  stock(branchId: String): Int
  attributes: [ProductAttribute!]!
  images: [ProductImage!]!
  product: Product!
  createdAt: DateTime!
  updatedAt: DateTime!
}
```

##### `Tag`
```graphql
{
  id: ID!
  name: String!
  slug: String!
  products: [ProductTag!]!
  createdAt: DateTime!
  updatedAt: DateTime!
}
```

##### `Supplier`
```graphql
{
  id: ID!
  name: String!
  email: String
  phone: String
  address: String
  products: [ProductSupplier!]!
  createdAt: DateTime!
  updatedAt: DateTime!
}
```

##### `ProductAttribute`
```graphql
{
  id: ID!
  key: String!
  value: String!
  product: Product
  variant: ProductVariant
}
```

---

#### Queries

##### `products` - List Products

**Auth:** Public

**Arguments:**
- `search: String` - Search by name
- `tagSlug: String` - Filter by tag
- `isVisible: Boolean` (default: true)
- `take: Int` (default: 20)
- `skip: Int` (default: 0)

**Response:** `ProductList`
```graphql
{
  items: [Product!]!
  count: Int!
}
```

**Example:**
```json
{
  "query": "query { products(search: \"chocolate\", tagSlug: \"snacks\", take: 10) { items { id name basePrice } count } }"
}
```

---

##### `product` - Get Single Product

**Auth:** Public

**Arguments:**
- `id: String!`

**Response:** `Product`

---

##### `tags` - List All Tags

**Auth:** Public

**Response:** `[Tag!]!`

---

##### `suppliers` - List Suppliers

**Auth:** Manager+

**Response:** `[Supplier!]!`

---

#### Mutations

##### `createProduct` - Create Product

**Auth:** Manager

**Arguments:**
```graphql
input CreateProductInput {
  name: String!
  slug: String
  description: String
  sku: String
  basePrice: Float!
  tagIds: [String!]
  supplierIds: [String!]
}
```

**Response:** `Product`

---

##### `updateProduct` - Update Product

**Auth:** Manager

**Arguments:**
- `id: String!`
- `input: UpdateProductInput!`

**Response:** `Product`

---

##### `deleteProduct` - Delete Product

**Auth:** Manager

**Arguments:**
- `id: String!`

**Response:** `Product`

---

##### `createVariant` - Create Product Variant

**Auth:** Manager

**Arguments:**
```graphql
input CreateVariantInput {
  productId: String!
  sku: String!
  name: String!
  price: Float!
}
```

**Response:** `ProductVariant`

---

##### `updateVariant` - Update Variant

**Auth:** Manager

**Arguments:**
- `id: String!`
- `input: UpdateVariantInput!`

**Response:** `ProductVariant`

---

##### `deleteVariant` - Delete Variant

**Auth:** Manager

**Arguments:**
- `id: String!`

**Response:** `ProductVariant`

---

##### `createTag` - Create Tag

**Auth:** Manager

**Arguments:**
```graphql
input CreateTagInput {
  name: String!
  slug: String
}
```

**Response:** `Tag`

---

##### `createSupplier` - Create Supplier

**Auth:** Manager

**Arguments:**
```graphql
input CreateSupplierInput {
  name: String!
  email: String
  phone: String
  address: String
}
```

**Response:** `Supplier`

---

##### `createAttribute` - Create Product Attribute

**Auth:** Manager

**Arguments:**
```graphql
input CreateAttributeInput {
  productId: String
  variantId: String
  key: String!
  value: String!
}
```

**Note:** Either `productId` or `variantId` is required.

**Response:** `ProductAttribute`

---

### Media Module (`media`)

#### Types

##### `ProductImage`
```graphql
{
  id: ID!
  url: String!
  altText: String
  sortOrder: Int!
  product: Product
  variant: ProductVariant
}
```

---

#### Mutations

##### `createImage` - Add Product Image

**Auth:** Manager

**Arguments:**
```graphql
input CreateImageInput {
  productId: String
  variantId: String
  url: String!
  altText: String
  sortOrder: Int
}
```

**Note:** Either `productId` or `variantId` is required.

**Response:** `ProductImage`

---

##### `updateImage` - Update Image

**Auth:** Manager

**Arguments:**
- `id: String!`
- `input: UpdateImageInput!`

**Response:** `ProductImage`

---

##### `deleteImage` - Delete Image

**Auth:** Manager

**Arguments:**
- `id: String!`

**Response:** `Boolean`

---

### Inventory Module (`inventory`)

#### Types

##### `StockMovement`
```graphql
{
  id: ID!
  type: String!  # INBOUND, OUTBOUND, ADJUSTMENT, TRANSFER
  quantity: Int!
  reason: String
  referenceId: String
  branch: Branch!
  product: Product!
  variant: ProductVariant
  createdAt: DateTime!
}
```

---

#### Queries

##### `stockMovements` - List Stock Movements

**Auth:** Manager+

**Arguments:**
- `branchId: String`
- `productId: String`
- `variantId: String`
- `take: Int` (default: 20, max: 100)
- `skip: Int` (default: 0)

**Response:** `StockMovementList`

---

##### `stock` - Get Current Stock

**Auth:** Manager+

**Arguments:**
- `branchId: String!`
- `productId: String!`
- `variantId: String`

**Response:** `Int`

---

#### Mutations

##### `createStockMovement` - Record Stock Movement

**Auth:** Manager

**Arguments:**
```graphql
input CreateStockMovementInput {
  branchId: String!
  productId: String!
  variantId: String
  type: String!  # INBOUND, OUTBOUND, ADJUSTMENT, TRANSFER
  quantity: Int!  # 1-1000000
  reason: String
  referenceId: String
}
```

**Response:** `StockMovement`

---

### Customers Module (`customers`)

#### Types

##### `Customer`
```graphql
{
  id: ID!
  email: String!
  firstName: String!
  lastName: String!
  phone: String
  isActive: Boolean!
  addresses: [CustomerAddress!]!
  createdAt: DateTime!
  updatedAt: DateTime!
}
```

##### `CustomerAddress`
```graphql
{
  id: ID!
  label: String!
  street: String!
  city: String!
  province: String!
  zipCode: String!
  country: String!
  isDefault: Boolean!
  customer: Customer!
}
```

---

#### Queries

##### `meCustomer` - Get Customer Profile

**Auth:** Customer

**Response:** `Customer`

---

#### Mutations

##### `updateProfile` - Update Customer Profile

**Auth:** Customer

**Arguments:**
```graphql
input UpdateProfileInput {
  firstName: String
  lastName: String
  phone: String
}
```

**Response:** `Customer`

---

##### `createAddress` - Add Address

**Auth:** Customer

**Arguments:**
```graphql
input CreateAddressInput {
  label: String!
  street: String!
  city: String!
  province: String!
  zipCode: String!
  country: String
  isDefault: Boolean
}
```

**Response:** `CustomerAddress`

---

##### `updateAddress` - Update Address

**Auth:** Customer (own address only)

**Arguments:**
- `id: String!`
- `input: UpdateAddressInput!`

**Response:** `CustomerAddress`

---

##### `deleteAddress` - Delete Address

**Auth:** Customer (own address only)

**Arguments:**
- `id: String!`

**Response:** `Boolean`

---

### Cart Module (`cart`)

#### Types

##### `Cart`
```graphql
{
  id: ID!
  items: [CartItem!]!
  totalItems: Int!
  totalAmount: Float!
}
```

##### `CartItem`
```graphql
{
  productId: ID!
  variantId: ID
  name: String!
  price: Float!
  quantity: Int!
  imageUrl: String
}
```

##### `StockValidationResult`
```graphql
{
  valid: Boolean!
  errors: [String!]!
}
```

---

#### Queries

##### `cart` - Get Guest Cart

**Auth:** Public

**Arguments:**
- `cartId: String!` (must be 10-100 characters)

**Response:** `Cart`

---

##### `myCart` - Get Customer Cart

**Auth:** Customer

**Response:** `Cart`

---

##### `validateCartStock` - Validate Cart Stock Availability

**Auth:** Public

**Arguments:**
- `cartId: String!`
- `branchId: String!`

**Response:** `StockValidationResult`

---

#### Mutations

##### `createCart` - Create Guest Cart

**Auth:** Public

**Response:** `String` (cart ID)

---

##### `addToCart` - Add Item to Cart

**Auth:** Public

**Arguments:**
```graphql
input AddToCartInput {
  cartId: String
  productId: String!
  variantId: String
  name: String!
  price: Float!
  quantity: Int!
  imageUrl: String
}
```

**Response:** `Cart`

**Note:** `cartId` is optional for logged-in customers (uses user ID).

---

##### `updateCartItem` - Update Cart Item Quantity

**Auth:** Public

**Arguments:**
- `cartId: String!`
- `input: UpdateCartItemInput!`

```graphql
input UpdateCartItemInput {
  productId: String!
  variantId: String
  quantity: Int!  # 0 to remove
}
```

**Response:** `Cart`

---

##### `removeFromCart` - Remove Item from Cart

**Auth:** Public

**Arguments:**
- `cartId: String!`
- `productId: String!`
- `variantId: String`

**Response:** `Cart`

---

##### `clearCart` - Clear Cart

**Auth:** Public

**Arguments:**
- `cartId: String!`

**Response:** `Boolean`

---

##### `mergeCart` - Merge Guest Cart into User Cart

**Auth:** Customer

**Arguments:**
- `guestCartId: String!`

**Response:** `Cart`

---

### Orders Module (`orders`)

#### Types

##### `Order`
```graphql
{
  id: ID!
  status: String!  # pending, confirmed, cancelled, refunded
  paymentStatus: String!  # pending, approved, rejected
  paymentId: String
  preferenceId: String
  totalAmount: Decimal!
  notes: String
  guestEmail: String
  branch: Branch!
  customer: Customer
  items: [OrderItem!]!
  createdAt: DateTime!
  updatedAt: DateTime!
}
```

##### `OrderItem`
```graphql
{
  id: ID!
  name: String!
  sku: String
  price: Decimal!
  quantity: Int!
  total: Decimal!
  product: Product!
  variant: ProductVariant
}
```

---

#### Queries

##### `orders` - List Orders (Manager)

**Auth:** Manager+

**Arguments:**
- `status: String` - Filter by order status
- `take: Int` (default: 20)
- `skip: Int` (default: 0)

**Response:** `OrderList`

---

##### `myOrders` - List Customer Orders

**Auth:** Customer

**Arguments:**
- `take: Int` (default: 20)
- `skip: Int` (default: 0)

**Response:** `OrderList`

---

##### `order` - Get Single Order

**Auth:** Authenticated (customer can only view own orders)

**Arguments:**
- `id: String!`

**Response:** `Order`

---

##### `guestOrders` - Get Orders by Email

**Auth:** Public (rate limited)

**Arguments:**
- `email: String!`

**Response:** `[Order!]!`

---

#### Mutations

##### `updateOrderStatus` - Update Order Status

**Auth:** Manager

**Arguments:**
- `id: String!`
- `input: UpdateOrderStatusInput!`

```graphql
input UpdateOrderStatusInput {
  status: String!  # pending, confirmed, cancelled, refunded
}
```

**Response:** `Order`

---

### Checkout Module (`checkout`)

#### Types

##### `CheckoutResult`
```graphql
{
  preferenceId: String
  initPoint: String
  sandboxInitPoint: String
  totalAmount: Float!
}
```

---

#### Mutations

##### `checkout` - Create MercadoPago Checkout

**Auth:** Public

**Arguments:**
```graphql
input CheckoutInput {
  cartId: String!
  branchId: String!
  guestEmail: String
}
```

**Response:** `CheckoutResult`

**Example Response:**
```json
{
  "data": {
    "checkout": {
      "preferenceId": "1234567890",
      "initPoint": "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=1234567890",
      "sandboxInitPoint": "https://sandbox.mercadopago.com.ar/...",
      "totalAmount": 1599.99
    }
  }
}
```

**Note:** Use `sandboxInitPoint` in test mode, `initPoint` in production.

---

## Webhook Endpoints

### MercadoPago Webhook

```
POST /webhooks/mercadopago
Content-Type: application/json
X-Signature: <signature>
```

**Purpose:** Receives payment notifications from MercadoPago when payments are completed.

**Signature Verification:**
The webhook includes an `X-Signature` header containing a timestamp and HMAC hash. The signature is verified using the `MP_WEBHOOK_SECRET` environment variable.

**Payload Structure:**
```json
{
  "type": "payment",
  "data": {
    "id": "1234567890",
    "preference_id": "pref-123"
  }
}
```

**Processing:**
1. Validates webhook signature
2. Checks for idempotency (prevents duplicate processing)
3. Fetches payment details from MercadoPago
4. If payment is approved:
   - Creates order from cart snapshot
   - Clears the cart
   - Updates order status

**Response:**
- `200 OK` - Webhook received (or already processed)
- `401 Unauthorized` - Invalid signature
- `400 Bad Request` - Invalid payload

---

## Authentication Scopes Summary

| Scope | Description |
|-------|-------------|
| `public` | No authentication required |
| `authenticated` | Any logged-in user |
| `customer` | Customer role only |
| `manager` | Manager or admin role |
| `admin` | Admin role only |

---

## Pagination Convention

List queries use a common pattern:

```graphql
{
  items: [Type!]!
  count: Int!
}
```

Arguments:
- `take: Int` - Number of items to return (default varies)
- `skip: Int` - Number of items to skip for pagination

---

## Decimal Handling

Prices and monetary values are returned as strings to preserve precision:

```json
{
  "basePrice": "99.99"
}
```

Always parse decimal values as strings when displaying or performing calculations.

---

## Common Request Example

```bash
curl -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "x-tenant-id: my-tenant" \
  -d '{
    "query": "query { products(take: 5) { items { id name basePrice } count } }"
  }'
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | Yes | Redis connection string |
| `JWT_ADMIN_SECRET` | Yes | Secret for admin/manager tokens |
| `JWT_CUSTOMER_SECRET` | Yes | Secret for customer tokens |
| `MP_ACCESS_TOKEN` | Yes | MercadoPago access token |
| `MP_WEBHOOK_SECRET` | Yes | MercadoPago webhook verification secret |
| `MP_MODE` | No | "test" or "production" (default: test) |
| `PORT` | No | Server port (default: 4000) |
| `FRONTEND_URL` | Yes (prod) | Frontend URL for CORS and webhooks |
| `NODE_ENV` | No | "development" or "production" |
