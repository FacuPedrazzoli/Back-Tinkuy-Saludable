import { builder } from "@/graphql/builder";
import { prisma } from "@/lib/prisma";
import { AuthError, ValidationError } from "@/lib/errors";

const POINTS_REDEMPTION_RATE = 0.01;

const LoyaltyPointRecord = builder.objectRef<{
  id: string;
  points: number;
  type: string;
  description: string;
  createdAt: Date;
}>("LoyaltyPointRecord").implement({
  fields: (t) => ({
    id: t.exposeID("id"),
    points: t.exposeInt("points"),
    type: t.exposeString("type"),
    description: t.exposeString("description"),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
  }),
});

const LoyaltySummary = builder.objectRef<{
  balance: number;
  tier: string;
  tierColor: string;
  benefits: string[];
  history: Array<{
    id: string;
    points: number;
    type: string;
    description: string;
    createdAt: Date;
  }>;
}>("LoyaltySummary").implement({
  fields: (t) => ({
    balance: t.exposeInt("balance"),
    tier: t.exposeString("tier"),
    tierColor: t.exposeString("tierColor"),
    benefits: t.exposeStringList("benefits"),
    history: t.field({
      type: [LoyaltyPointRecord],
      resolve: (parent) => parent.history,
    }),
  }),
});

const RedemptionResult = builder.objectRef<{
  pointsRedeemed: number;
  discountAmount: number;
  newBalance: number;
}>("RedemptionResult").implement({
  fields: (t) => ({
    pointsRedeemed: t.exposeInt("pointsRedeemed"),
    discountAmount: t.exposeFloat("discountAmount"),
    newBalance: t.exposeInt("newBalance"),
  }),
});

builder.queryField("myPoints", (t) =>
  t.field({
    type: LoyaltySummary,
    authScopes: { authenticated: true },
    resolve: async (_parent, _args, ctx) => {
      if (!ctx.user) throw new AuthError("No autenticado");

      const records = await prisma.loyaltyPoint.findMany({
        where: { customerId: ctx.user.id },
        orderBy: { createdAt: "desc" },
        take: 20,
      });

      const totalPoints = records.reduce((sum, r) => sum + r.points, 0);

      const tier = getTier(totalPoints);

      return {
        balance: totalPoints,
        tier: tier.tier,
        tierColor: tier.color,
        benefits: tier.benefits,
        history: records,
      };
    },
  })
);

builder.mutationField("redeemPoints", (t) =>
  t.field({
    type: RedemptionResult,
    authScopes: { authenticated: true },
    args: {
      points: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, ctx) => {
      if (!ctx.user) throw new AuthError("No autenticado");

      const pointsToRedeem = args.points;
      if (pointsToRedeem < 100) {
        throw new ValidationError("Mínimo 100 puntos para canjear");
      }

      const user = await prisma.customer.findUnique({
        where: { id: ctx.user.id },
        select: { loyaltyPoints: true },
      });

      if ((user?.loyaltyPoints ?? 0) < pointsToRedeem) {
        throw new ValidationError("Puntos insuficientes");
      }

      const discountAmount = pointsToRedeem * POINTS_REDEMPTION_RATE;

      await prisma.loyaltyPoint.create({
        data: {
          customerId: ctx.user.id,
          points: -pointsToRedeem,
          type: "REDEEM",
          description: `Canje de ${pointsToRedeem} puntos por $${discountAmount.toFixed(2)} de descuento`,
        },
      });

      await prisma.customer.update({
        where: { id: ctx.user.id },
        data: { loyaltyPoints: { decrement: pointsToRedeem } },
      });

      return {
        pointsRedeemed: pointsToRedeem,
        discountAmount,
        newBalance: (user?.loyaltyPoints ?? 0) - pointsToRedeem,
      };
    },
  })
);

function getTier(points: number) {
  if (points >= 2000) {
    return {
      tier: "Árbol",
      color: "#4A7C59",
      benefits: ["5% de descuento en todas las compras", "Envío gratis prioritario", "Acceso anticipado a ofertas"],
    };
  } else if (points >= 500) {
    return {
      tier: "Brote",
      color: "#9CAF88",
      benefits: ["3% de descuento en todas las compras", "Envío gratis en compras +$10.000"],
    };
  }
  return {
    tier: "Semilla",
    color: "#C4956A",
    benefits: ["Puntos dobles en tu primera compra"],
  };
}
