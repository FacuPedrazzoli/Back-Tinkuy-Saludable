// =============================================================================
// QUERY TYPE
// =============================================================================
// The main builder.queryType definition should be moved here.
// This defines all top-level query fields.
//
// Expected content (~200 lines):
// - builder.queryType({})
// - All query fields defined with t.queryField() or similar
//
// Note: In the current architecture, queries are auto-registered
// via queryField() calls in each module's resolver.ts file.
// This file would contain the central query type configuration.
//
// Current architecture uses:
// - @modules/auth/resolver.ts
// - @modules/catalog/resolver.ts
// - @modules/orders/resolver.ts
// etc.
//
// Each module calls queryField() to self-register.
