import { builder } from "@/graphql/builder";
import { prisma } from "@/lib/prisma";
import { AuthError } from "@/lib/errors";

const ReviewStatus = builder.enumType("ReviewStatus", {
  values: ["PENDING", "APPROVED", "REJECTED"] as const,
});

export { ReviewStatus };

const ReviewCustomer = builder.objectRef<{
  firstName: string;
  lastName: string;
}>("ReviewCustomer").implement({
  fields: (t) => ({
    firstName: t.exposeString("firstName"),
    lastName: t.exposeString("lastName"),
  }),
});

const Review = builder.prismaObject("Review", {
  fields: (t) => ({
    id: t.exposeID("id"),
    rating: t.exposeInt("rating"),
    title: t.exposeString("title", { nullable: true }),
    comment: t.exposeString("comment", { nullable: true }),
    isApproved: t.exposeBoolean("isApproved"),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    customer: t.field({
      type: ReviewCustomer,
      resolve: (review) => {
        const r = review as { customer?: { firstName: string | null; lastName: string | null } };
        return {
          firstName: r.customer?.firstName ?? "Anónimo",
          lastName: r.customer?.lastName ?? "",
        };
      },
    }),
  }),
});

const RatingSummary = builder.objectRef<{
  averageRating: number;
  totalReviews: number;
  distribution: Record<number, number>;
}>("RatingSummary").implement({
  fields: (t) => ({
    averageRating: t.exposeFloat("averageRating"),
    totalReviews: t.exposeInt("totalReviews"),
    distribution: t.expose("distribution", { type: "JSON" }),
  }),
});

const CreateReviewInput = builder.inputType("CreateReviewInput", {
  fields: (t) => ({
    productId: t.string({ required: true }),
    rating: t.int({ required: true }),
    title: t.string({}),
    comment: t.string({}),
  }),
});

builder.queryField("productReviews", (t) =>
  t.field({
    type: [Review],
    authScopes: { public: true },
    args: {
      productId: t.arg.string({ required: true }),
      first: t.arg.int({ defaultValue: 10 }),
      skip: t.arg.int({ defaultValue: 0 }),
    },
    resolve: async (_parent, args) => {
      return prisma.review.findMany({
        where: {
          productId: args.productId,
          isApproved: true,
        },
        include: {
          customer: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: args.first ?? 10,
        skip: args.skip ?? 0,
      });
    },
  })
);

builder.queryField("productRatingSummary", (t) =>
  t.field({
    type: RatingSummary,
    authScopes: { public: true },
    args: {
      productId: t.arg.string({ required: true }),
    },
    resolve: async (_parent, args) => {
      const reviews = await prisma.review.findMany({
        where: {
          productId: args.productId,
          isApproved: true,
        },
        select: { rating: true },
      });

      if (reviews.length === 0) {
        return { averageRating: 0, totalReviews: 0, distribution: {} };
      }

      const total = reviews.reduce((sum, r) => sum + r.rating, 0);
      const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

      for (const review of reviews) {
        if (review.rating >= 1 && review.rating <= 5) {
          distribution[review.rating]++;
        }
      }

      return {
        averageRating: total / reviews.length,
        totalReviews: reviews.length,
        distribution,
      };
    },
  })
);

builder.mutationField("createReview", (t) =>
  t.field({
    type: Review,
    authScopes: { authenticated: true },
    args: {
      input: t.arg({ type: CreateReviewInput, required: true }),
    },
    resolve: async (_parent, args, ctx) => {
      if (!ctx.user) {
        throw new AuthError("Debes estar logueado para dejar una opinión");
      }

      const { productId, rating, title, comment } = args.input as {
        productId: string;
        rating: number;
        title?: string;
        comment?: string;
      };

      const existing = await prisma.review.findUnique({
        where: {
          productId_customerId: {
            productId,
            customerId: ctx.user.id,
          },
        },
      });

      if (existing) {
        throw new Error("Ya dejaste una opinión sobre este producto");
      }

      return prisma.review.create({
        data: {
          productId,
          customerId: ctx.user.id,
          rating,
          title,
          comment,
          isApproved: false,
        },
      });
    },
  })
);

builder.mutationField("approveReview", (t) =>
  t.field({
    type: Review,
    authScopes: { manager: true },
    args: {
      reviewId: t.arg.string({ required: true }),
    },
    resolve: async (_parent, args, ctx) => {
      if (!ctx.user || (ctx.user.role !== "admin" && ctx.user.role !== "manager")) {
        throw new AuthError("No tienes permisos para aprobar opiniones");
      }

      return prisma.review.update({
        where: { id: args.reviewId },
        data: {
          isApproved: true,
          approvedAt: new Date(),
          approvedBy: ctx.user.id,
        },
      });
    },
  })
);

builder.mutationField("deleteReview", (t) =>
  t.field({
    type: Review,
    authScopes: { manager: true },
    args: {
      reviewId: t.arg.string({ required: true }),
    },
    resolve: async (_parent, args, ctx) => {
      if (!ctx.user || (ctx.user.role !== "admin" && ctx.user.role !== "manager")) {
        throw new AuthError("No tienes permisos para eliminar opiniones");
      }

      return prisma.review.delete({
        where: { id: args.reviewId },
      });
    },
  })
);
