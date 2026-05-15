import { builder } from "./builder";

// Import module resolvers to register them
// These modules self-register by importing builder and calling queryField/mutationField
import "@modules/auth/resolver";
import "@modules/tenants/resolver";
import "@modules/catalog/resolver";
import "@modules/media/resolver";
import "@modules/inventory/resolver";
import "@modules/customers/resolver";
import "@modules/cart/resolver";
import "@modules/orders/resolver";
import "@modules/checkout/resolver";
import "@modules/coupons/resolver";
import "@modules/categories/resolver";
import "@modules/reviews/resolver";
import "@modules/newsletter/resolver";
import "@modules/loyalty/resolver";

export const schema = builder.toSchema();
