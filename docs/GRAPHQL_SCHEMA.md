# GraphQL API Reference

Backend API for Tinkuy Saludable, built with Pothos GraphQL and Prisma.

## Table of Contents

- [Scalars](#scalars)
- [Enums](#enums)
- [Types](#types)
- [Input Types](#input-types)
- [Queries](#queries)
- [Mutations](#mutations)

---

## Scalars

| Scalar | Description |
|--------|-------------|
| `DateTime` | ISO 8601 date-time string |
| `JSON` | Arbitrary JSON value |
| `Decimal` | Decimal number as string (for precision) |

---

## Enums

### Role
User roles for access control.

```graphql
enum Role {
  admin    # Full system access
  manager  # Tenant-level management
  customer # Customer access
}
```

### MovementType
Stock movement types for inventory tracking.

```graphql
enum MovementType {
  INBOUND    # Stock received
  OUTBOUND   # Stock shipped/sold
  ADJUSTMENT # Manual adjustment
  TRANSFER   # Between branches
}
```

### OrderStatus
Order lifecycle states.

```graphql
enum OrderStatus {
  pending    # Awaiting payment
  confirmed  # Payment approved
  cancelled  # Order cancelled
  refunded   # Payment refunded
}
```

### PaymentStatus
MercadoPago payment states.

```graphql
enum PaymentStatus {
  pending   # Awaiting payment
  approved  # Payment successful
  rejected  # Payment failed
}
```

---

## Types

### Auth Types

#### AuthUser
Authenticated user information (admin/manager).

```graphql
type AuthUser {
  id: ID!
  email: String!
  firstName: String!
  lastName: String!
  role: String!
  tenantId: ID!
}
```

#### CustomerAuthUser
Customer profile during authentication.

```graphql
type CustomerAuthUser {
  id: ID!
  email: String!
  firstName: String!
  lastName: String!
}
```

#### CustomerAuthResult
Result of customer login/register.

```graphql
type CustomerAuthResult {
  token: String!
  customer: CustomerAuthUser!
}
```

#### AdminAuthResult
Result of admin login.

```graphql
type AdminAuthResult {
  token: String!
  user: AuthUser!
}
```

---

### Tenant Types

#### Tenant
Multi-tenant organization.

```graphql
type Tenant {
  id: ID!
  name: String!
  slug: String!
  isActive: Boolean!
  createdAt: DateTime!
  updatedAt: DateTime!
  branches: [Branch!]!
}
```

#### Branch
Physical store location.

```graphql
type Branch {
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

#### TenantList
Paginated tenant list.

```graphql
type TenantList {
  items: [Tenant!]!
  count: Int!
}
```

---

### Catalog Types

#### Product
Product with variants and attributes.

```graphql
type Product {
  id: ID!
  name: String!
  slug: String!
  description: String
  sku: String
  isActive: Boolean!
  isVisible: Boolean!
  basePrice: Decimal!
  createdAt: DateTime!
  updatedAt: DateTime!
  variants: [ProductVariant!]!
  attributes: [ProductAttribute!]!
  images: [ProductImage!]!
  tags: [Tag!]!
  suppliers: [Supplier!]!
  stock(branchId: String): Int
}
```

#### ProductVariant
Specific product variant (e.g., size, flavor).

```graphql
type ProductVariant {
  id: ID!
  sku: String!
  name: String!
  price: Decimal!
  isActive: Boolean!
  createdAt: DateTime!
  updatedAt: DateTime!
  product: Product!
  attributes: [ProductAttribute!]!
  images: [ProductImage!]!
  stock(branchId: String): Int
}
```

#### ProductAttribute
Key-value attribute for product or variant.

```graphql
type ProductAttribute {
  id: ID!
  key: String!
  value: String!
  createdAt: DateTime!
  product: Product
  variant: ProductVariant
}
```

#### ProductImage
Product or variant image.

```graphql
type ProductImage {
  id: ID!
  url: String!
  altText: String
  sortOrder: Int!
  createdAt: DateTime!
  product: Product
  variant: ProductVariant
}
```

#### Tag
Product categorization tag.

```graphql
type Tag {
  id: ID!
  name: String!
  slug: String!
  createdAt: DateTime!
  updatedAt: DateTime!
  products: [Product!]!
}
```

#### ProductTag
Many-to-many relationship between product and tag.

```graphql
type ProductTag {
  product: Product!
  tag: Tag!
}
```

#### Supplier
Product supplier/vendor.

```graphql
type Supplier {
  id: ID!
  name: String!
  email: String
  phone: String
  address: String
  createdAt: DateTime!
  updatedAt: DateTime!
  products: [Product!]!
}
```

#### ProductSupplier
Many-to-many relationship with cost tracking.

```graphql
type ProductSupplier {
  product: Product!
  supplier: Supplier!
  costPrice: Decimal
  sku: String
  createdAt: DateTime!
}
```

#### ProductList
Paginated product list.

```graphql
type ProductList {
  items: [Product!]!
  count: Int!
}
```

---

### Customer Types

#### Customer
Registered customer account.

```graphql
type Customer {
  id: ID!
  email: String!
  firstName: String!
  lastName: String!
  phone: String
  isActive: Boolean!
  createdAt: DateTime!
  updatedAt: DateTime!
  addresses: [CustomerAddress!]!
}
```

#### CustomerAddress
Customer shipping address.

```graphql
type CustomerAddress {
  id: ID!
  label: String!
  street: String!
  city: String!
  province: String!
  zipCode: String!
  country: String!
  isDefault: Boolean!
  createdAt: DateTime!
  updatedAt: DateTime!
  customer: Customer!
}
```

---

### Cart Types

#### Cart
Shopping cart.

```graphql
type Cart {
  id: ID!
  items: [CartItem!]!
  totalItems: Int!
  totalAmount: Float!
}
```

#### CartItem
Item in cart.

```graphql
type CartItem {
  productId: ID!
  variantId: ID
  name: String!
  price: Float!
  quantity: Int!
  imageUrl: String
}
```

#### StockValidationResult
Stock validation for cart items.

```graphql
type StockValidationResult {
  valid: Boolean!
  errors: [String!]!
}
```

---

### Inventory Types

#### StockMovement
Immutable inventory transaction record.

```graphql
type StockMovement {
  id: ID!
  type: String!
  quantity: Int!
  reason: String
  referenceId: String
  createdAt: DateTime!
  branch: Branch!
  product: Product!
  variant: ProductVariant
}
```

#### StockMovementList
Paginated stock movement list.

```graphql
type StockMovementList {
  items: [StockMovement!]!
  count: Int!
}
```

---

### Order Types

#### Order
Customer order.

```graphql
type Order {
  id: ID!
  status: String!
  paymentStatus: String!
  paymentId: String
  preferenceId: String
  totalAmount: Decimal!
  notes: String
  guestEmail: String
  createdAt: DateTime!
  updatedAt: DateTime!
  branch: Branch!
  customer: Customer
  items: [OrderItem!]!
}
```

#### OrderItem
Individual item in an order.

```graphql
type OrderItem {
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

#### OrderList
Paginated order list.

```graphql
type OrderList {
  items: [Order!]!
  count: Int!
}
```

---

### Checkout Types

#### CheckoutResult
Result of checkout process.

```graphql
type CheckoutResult {
  preferenceId: String
  initPoint: String
  sandboxInitPoint: String
  totalAmount: Float!
}
```

---

## Input Types

### Authentication Inputs

```graphql
input AdminLoginInput {
  email: String!
  password: String!
  tenantId: String!
}

input CustomerLoginInput {
  email: String!
  password: String!
  tenantId: String!
}

input CustomerRegisterInput {
  email: String!
  password: String!
  firstName: String!
  lastName: String!
  phone: String
  tenantId: String!
}

input ChangePasswordInput {
  oldPassword: String!
  newPassword: String!
}
```

### Tenant Inputs

```graphql
input CreateTenantInput {
  name: String!
  slug: String!
  branchName: String
}

input UpdateTenantInput {
  name: String
  isActive: Boolean
}

input CreateBranchInput {
  tenantId: String!
  name: String!
  address: String
  phone: String
}

input UpdateBranchInput {
  name: String
  address: String
  phone: String
  isActive: Boolean
}
```

### Catalog Inputs

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

input UpdateProductInput {
  name: String
  slug: String
  description: String
  sku: String
  basePrice: Float
  isActive: Boolean
  isVisible: Boolean
  tagIds: [String!]
}

input CreateVariantInput {
  productId: String!
  sku: String!
  name: String!
  price: Float!
}

input UpdateVariantInput {
  sku: String
  name: String
  price: Float
  isActive: Boolean
}

input CreateTagInput {
  name: String!
  slug: String
}

input CreateSupplierInput {
  name: String!
  email: String
  phone: String
  address: String
}

input CreateAttributeInput {
  productId: String
  variantId: String
  key: String!
  value: String!
}

input CreateImageInput {
  productId: String
  variantId: String
  url: String!
  altText: String
  sortOrder: Int
}

input UpdateImageInput {
  url: String
  altText: String
  sortOrder: Int
}
```

### Inventory Inputs

```graphql
input CreateStockMovementInput {
  branchId: String!
  productId: String!
  variantId: String
  type: String!
  quantity: Int!
  reason: String
  referenceId: String
}
```

### Customer Inputs

```graphql
input UpdateProfileInput {
  firstName: String
  lastName: String
  phone: String
}

input CreateAddressInput {
  label: String!
  street: String!
  city: String!
  province: String!
  zipCode: String!
  country: String
  isDefault: Boolean
}

input UpdateAddressInput {
  label: String
  street: String
  city: String
  province: String
  zipCode: String
  country: String
  isDefault: Boolean
}
```

### Cart Inputs

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

input UpdateCartItemInput {
  productId: String!
  variantId: String
  quantity: Int!
}
```

### Checkout Inputs

```graphql
input CheckoutInput {
  cartId: String!
  branchId: String!
  guestEmail: String
}
```

### Order Inputs

```graphql
input UpdateOrderStatusInput {
  status: String!
}
```

---

## Queries

### Authentication

| Query | Args | Returns | Auth |
|-------|------|---------|------|
| `me` | - | `AuthUser` | authenticated |

### Tenants

| Query | Args | Returns | Auth |
|-------|------|---------|------|
| `tenants` | `take`, `skip` | `TenantList` | admin |
| `tenant` | `slug` | `Tenant` | public |
| `branches` | `take`, `skip` | `[Branch!]` | manager |

### Catalog

| Query | Args | Returns | Auth |
|-------|------|---------|------|
| `products` | `search`, `tagSlug`, `isVisible`, `take`, `skip` | `ProductList` | public |
| `product` | `id` | `Product` | public |
| `tags` | - | `[Tag!]` | public |
| `suppliers` | - | `[Supplier!]` | manager |

### Inventory

| Query | Args | Returns | Auth |
|-------|------|---------|------|
| `stockMovements` | `branchId`, `productId`, `variantId`, `take`, `skip` | `StockMovementList` | manager |
| `stock` | `branchId`, `productId`, `variantId` | `Int` | manager |

### Cart

| Query | Args | Returns | Auth |
|-------|------|---------|------|
| `cart` | `cartId` | `Cart` | public |
| `myCart` | - | `Cart` | customer |
| `validateCartStock` | `cartId`, `branchId` | `StockValidationResult` | public |

### Customers

| Query | Args | Returns | Auth |
|-------|------|---------|------|
| `meCustomer` | - | `Customer` | customer |

### Orders

| Query | Args | Returns | Auth |
|-------|------|---------|------|
| `orders` | `status`, `take`, `skip` | `OrderList` | manager |
| `myOrders` | `take`, `skip` | `OrderList` | customer |
| `order` | `id` | `Order` | authenticated |
| `guestOrders` | `email` | `[Order!]` | public |

---

## Mutations

### Authentication

| Mutation | Args | Returns | Auth |
|----------|------|---------|------|
| `adminLogin` | `input: AdminLoginInput` | `AdminAuthResult` | public |
| `customerLogin` | `input: CustomerLoginInput` | `CustomerAuthResult` | public |
| `customerRegister` | `input: CustomerRegisterInput` | `CustomerAuthResult` | public |
| `changePassword` | `input: ChangePasswordInput` | `Boolean` | authenticated |

### Tenants

| Mutation | Args | Returns | Auth |
|----------|------|---------|------|
| `createTenant` | `input: CreateTenantInput` | `Tenant` | admin |
| `updateTenant` | `id`, `input: UpdateTenantInput` | `Tenant` | admin |
| `createBranch` | `input: CreateBranchInput` | `Branch` | manager |
| `updateBranch` | `id`, `input: UpdateBranchInput` | `Branch` | manager |

### Catalog

| Mutation | Args | Returns | Auth |
|----------|------|---------|------|
| `createProduct` | `input: CreateProductInput` | `Product` | manager |
| `updateProduct` | `id`, `input: UpdateProductInput` | `Product` | manager |
| `deleteProduct` | `id` | `Product` | manager |
| `createVariant` | `input: CreateVariantInput` | `ProductVariant` | manager |
| `updateVariant` | `id`, `input: UpdateVariantInput` | `ProductVariant` | manager |
| `deleteVariant` | `id` | `ProductVariant` | manager |
| `createTag` | `input: CreateTagInput` | `Tag` | manager |
| `createSupplier` | `input: CreateSupplierInput` | `Supplier` | manager |
| `createAttribute` | `input: CreateAttributeInput` | `ProductAttribute` | manager |

### Media

| Mutation | Args | Returns | Auth |
|----------|------|---------|------|
| `createImage` | `input: CreateImageInput` | `ProductImage` | manager |
| `updateImage` | `id`, `input: UpdateImageInput` | `ProductImage` | manager |
| `deleteImage` | `id` | `Boolean` | manager |

### Inventory

| Mutation | Args | Returns | Auth |
|----------|------|---------|------|
| `createStockMovement` | `input: CreateStockMovementInput` | `StockMovement` | manager |

### Customers

| Mutation | Args | Returns | Auth |
|----------|------|---------|------|
| `updateProfile` | `input: UpdateProfileInput` | `Customer` | customer |
| `createAddress` | `input: CreateAddressInput` | `CustomerAddress` | customer |
| `updateAddress` | `id`, `input: UpdateAddressInput` | `CustomerAddress` | customer |
| `deleteAddress` | `id` | `Boolean` | customer |

### Cart

| Mutation | Args | Returns | Auth |
|----------|------|---------|------|
| `createCart` | - | `String` | public |
| `addToCart` | `input: AddToCartInput` | `Cart` | public |
| `updateCartItem` | `cartId`, `input: UpdateCartItemInput` | `Cart` | public |
| `removeFromCart` | `cartId`, `productId`, `variantId` | `Cart` | public |
| `clearCart` | `cartId` | `Boolean` | public |
| `mergeCart` | `guestCartId` | `Cart` | customer |

### Checkout

| Mutation | Args | Returns | Auth |
|----------|------|---------|------|
| `checkout` | `input: CheckoutInput` | `CheckoutResult` | public |

### Orders

| Mutation | Args | Returns | Auth |
|----------|------|---------|------|
| `updateOrderStatus` | `id`, `input: UpdateOrderStatusInput` | `Order` | manager |

---

## Relationships

```
Tenant (1) ──────< Branch (many)
│
├──< AdminUser (many)
│
├──< Customer (many)
│    └───< CustomerAddress (many)
│
├──< Product (many)
│    ├───< ProductVariant (many)
│    │    ├───< ProductAttribute (many)
│    │    ├───< ProductImage (many)
│    │    └───< OrderItem (many)
│    ├───< ProductAttribute (many)
│    ├───< ProductImage (many)
│    ├───< ProductTag (many) >──── Tag (many)
│    ├───< ProductSupplier (many) >──── Supplier (many)
│    └───< StockMovement (many)
│
├──< Tag (many)
│    └───< ProductTag (many) >──── Product (many)
│
├──< Supplier (many)
│    └───< ProductSupplier (many) >──── Product (many)
│
├──< StockMovement (many) >─── Branch, Product, ProductVariant
│
└──< Order (many) >─── Branch, Customer
     └───< OrderItem (many) >─── Product, ProductVariant
```

---

## Authorization Scopes

| Scope | Description |
|-------|-------------|
| `public` | Accessible without authentication |
| `authenticated` | Any logged-in user |
| `customer` | Customer role only |
| `manager` | Manager or admin role |
| `admin` | Admin role only |

---

## Pagination

List queries use cursor-style pagination:

```graphql
items: [Type!]!   # Results
count: Int!       # Total matching records
```

Arguments:
- `take: Int` - Maximum records to return (default varies)
- `skip: Int` - Number of records to skip (default: 0)
