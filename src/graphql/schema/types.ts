// =============================================================================
// OBJECT TYPES (Non-Query, Non-Mutation)
// =============================================================================
// All builder.objectType definitions should be moved here.
// These are the domain types exposed by the GraphQL API.
//
// Expected content (~400 lines):
// - User, Product, Order, Customer, Category, etc.
// - Connection types (if not already in types/connection.ts)
// - Any other object types defined with builder.objectType()
//
// Note: Query and Mutation types should go in queries.ts and mutations.ts respectively
//
// Current location: These are likely defined across various module resolvers:
// - @modules/auth/resolver.ts
// - @modules/catalog/resolver.ts
// - @modules/orders/resolver.ts
// - @modules/customers/resolver.ts
// etc.
