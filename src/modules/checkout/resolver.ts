import { builder } from "@graphql/builder";
import * as checkoutService from "./service";
import { rateLimitCheckout } from "@lib/rate-limit";
import { ValidationError, ForbiddenError } from "@lib/errors";
import { emailSchema } from "@lib/validation";

interface CheckoutResultShape {
  preferenceId: string | null | undefined;
  initPoint: string | null | undefined;
  sandboxInitPoint: string | null | undefined;
  totalAmount: number;
}

const CheckoutResult = builder.objectRef<CheckoutResultShape>("CheckoutResult").implement({
  fields: (t) => ({
    preferenceId: t.exposeString("preferenceId", { nullable: true }),
    initPoint: t.exposeString("initPoint", { nullable: true }),
    sandboxInitPoint: t.exposeString("sandboxInitPoint", { nullable: true }),
    totalAmount: t.exposeFloat("totalAmount"),
  }),
});

const CheckoutInput = builder.inputType("CheckoutInput", {
  fields: (t) => ({
    cartId: t.string({ required: true }),
    branchId: t.string({ required: true }),
    guestEmail: t.string({}),
  }),
});

builder.mutationField("checkout", (t) =>
  t.field({
    type: CheckoutResult,
    args: { input: t.arg({ type: CheckoutInput, required: true }) },
    authScopes: { public: true },
    resolve: async (_parent, { input }, ctx) => {
      const identifier = ctx.user?.id ?? ctx.req.ip ?? "anonymous";
      await rateLimitCheckout(`checkout:${identifier}`);

      const isUserCart = !!ctx.user;

      if (process.env.NODE_ENV === "production" && !process.env.FRONTEND_URL) {
        throw new ValidationError("FRONTEND_URL environment variable is required in production");
      }

      const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3000";
      const webhookUrl = `${frontendUrl}/webhooks/mercadopago`;

      if (!ctx.tenantId) throw new ForbiddenError("Tenant ID required");

      if (input.guestEmail) {
        const emailResult = emailSchema.safeParse(input.guestEmail);
        if (!emailResult.success) {
          throw new ValidationError(emailResult.error.errors[0].message);
        }
        input.guestEmail = emailResult.data;
      }

      return checkoutService.createCheckout({
        cartId: input.cartId,
        tenantId: ctx.tenantId,
        branchId: input.branchId,
        customerId: ctx.user?.id,
        guestEmail: input.guestEmail ?? undefined,
        frontendUrl,
        webhookUrl,
        isUserCart,
      });
    },
  })
);
