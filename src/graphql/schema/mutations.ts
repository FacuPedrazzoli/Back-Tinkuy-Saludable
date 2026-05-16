// =============================================================================
// MUTATION TYPE
// =============================================================================
// The main builder.mutationType definition should be moved here.
// This defines all top-level mutation fields.
//
// Expected content (~200 lines):
// - builder.mutationType({})
// - All mutation fields defined with t.mutationField() or similar
//
// Note: In the current architecture, mutations are auto-registered
// via mutationField() calls in each module's resolver.ts file.
// This file would contain the central mutation type configuration.
//
// Current architecture uses:
// - @modules/auth/resolver.ts
// - @modules/cart/resolver.ts
// - @modules/orders/resolver.ts
// - @modules/checkout/resolver.ts
// etc.
//
// Each module calls mutationField() to self-register.
