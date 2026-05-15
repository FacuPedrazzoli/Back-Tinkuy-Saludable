import { builder } from "@/graphql/builder";
import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/errors";
import { sendEmail } from "@/lib/email";
import { newsletterWelcomeEmail } from "@/emails/newsletter-welcome";
import { logger } from "@/lib/logger";

const NewsletterSubscriber = builder.prismaObject("NewsletterSubscriber", {
  fields: (t) => ({
    id: t.exposeID("id"),
    email: t.exposeString("email"),
    isActive: t.exposeBoolean("isActive"),
    subscribedAt: t.expose("subscribedAt", { type: "DateTime" }),
    source: t.exposeString("source", { nullable: true }),
  }),
});

const NewsletterStats = builder.objectRef<{
  total: number;
  active: number;
}>("NewsletterStats").implement({
  fields: (t) => ({
    total: t.exposeInt("total"),
    active: t.exposeInt("active"),
  }),
});

builder.queryField("newsletterStats", (t) =>
  t.field({
    type: NewsletterStats,
    authScopes: { public: true },
    resolve: async () => {
      const [total, active] = await Promise.all([
        prisma.newsletterSubscriber.count(),
        prisma.newsletterSubscriber.count({ where: { isActive: true } }),
      ]);
      return { total, active };
    },
  })
);

builder.mutationField("subscribeToNewsletter", (t) =>
  t.field({
    type: NewsletterSubscriber,
    authScopes: { public: true },
    args: {
      email: t.arg.string({ required: true }),
      source: t.arg.string({ defaultValue: "FOOTER" }),
    },
    resolve: async (_parent, args) => {
      const email = args.email?.toLowerCase();
      if (!email || !email.includes("@")) {
        throw new ValidationError("Email inválido");
      }

      const existing = await prisma.newsletterSubscriber.findUnique({
        where: { email },
      });

      let subscriber;
      if (existing?.unsubscribedAt) {
        subscriber = await prisma.newsletterSubscriber.update({
          where: { email },
          data: {
            isActive: true,
            unsubscribedAt: null,
            source: args.source,
          },
        });
      } else if (existing?.isActive) {
        throw new ValidationError("Este email ya está suscripto");
      } else {
        subscriber = await prisma.newsletterSubscriber.create({
          data: {
            email,
            source: args.source,
          },
        });
      }

      sendEmail(newsletterWelcomeEmail({ email })).catch((err) =>
        logger.error({ err, component: "email", type: "newsletterWelcome" }, "Failed to send newsletter welcome email")
      );

      return subscriber;
    },
  })
);

builder.mutationField("unsubscribeFromNewsletter", (t) =>
  t.field({
    type: "Boolean",
    authScopes: { public: true },
    args: {
      email: t.arg.string({ required: true }),
    },
    resolve: async (_parent, args) => {
      await prisma.newsletterSubscriber.update({
        where: { email: args.email?.toLowerCase() },
        data: {
          isActive: false,
          unsubscribedAt: new Date(),
        },
      });
      return true;
    },
  })
);
