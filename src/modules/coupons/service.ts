import { prisma } from "@lib/prisma";
import { NotFoundError, ValidationError } from "@lib/errors";

export async function listCoupons(tenantId: string) {
  return prisma.coupon.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getCouponById(id: string, tenantId: string) {
  const coupon = await prisma.coupon.findUnique({
    where: { id, tenantId },
  });
  if (!coupon) throw new NotFoundError("Coupon");
  return coupon;
}

export async function createCoupon(input: {
  tenantId: string;
  code: string;
  description?: string | null;
  discountType: "PERCENTAGE" | "FIXED";
  discountValue: number;
  minPurchase?: number | null;
  maxUses?: number | null;
  startsAt: Date;
  expiresAt: Date;
}) {
  const existing = await prisma.coupon.findFirst({
    where: { tenantId: input.tenantId, code: input.code },
  });
  if (existing) {
    throw new ValidationError("Coupon code already exists");
  }

  if (input.expiresAt <= input.startsAt) {
    throw new ValidationError("Expiration date must be after start date");
  }

  if (input.discountType === "PERCENTAGE" && (input.discountValue <= 0 || input.discountValue > 100)) {
    throw new ValidationError("Percentage discount must be between 0 and 100");
  }

  return prisma.coupon.create({
    data: {
      tenantId: input.tenantId,
      code: input.code,
      description: input.description,
      discountType: input.discountType,
      discountValue: input.discountValue,
      minPurchase: input.minPurchase,
      maxUses: input.maxUses,
      startsAt: input.startsAt,
      expiresAt: input.expiresAt,
    },
  });
}

export async function updateCoupon(
  id: string,
  input: {
    code?: string;
    description?: string | null;
    discountType?: "PERCENTAGE" | "FIXED";
    discountValue?: number;
    minPurchase?: number | null;
    maxUses?: number | null;
    startsAt?: Date;
    expiresAt?: Date;
    isActive?: boolean;
  },
  tenantId: string
) {
  const coupon = await getCouponById(id, tenantId);

  if (input.code && input.code !== coupon.code) {
    const existing = await prisma.coupon.findFirst({
      where: { tenantId, code: input.code },
    });
    if (existing) {
      throw new ValidationError("Coupon code already exists");
    }
  }

  if (input.expiresAt && input.startsAt && input.expiresAt <= input.startsAt) {
    throw new ValidationError("Expiration date must be after start date");
  }

  if (input.discountType === "PERCENTAGE" && input.discountValue !== undefined) {
    if (input.discountValue <= 0 || input.discountValue > 100) {
      throw new ValidationError("Percentage discount must be between 0 and 100");
    }
  }

  return prisma.coupon.update({
    where: { id },
    data: {
      code: input.code ?? undefined,
      description: input.description ?? undefined,
      discountType: input.discountType ?? undefined,
      discountValue: input.discountValue ?? undefined,
      minPurchase: input.minPurchase === null ? undefined : input.minPurchase,
      maxUses: input.maxUses === null ? undefined : input.maxUses,
      startsAt: input.startsAt ?? undefined,
      expiresAt: input.expiresAt ?? undefined,
      isActive: input.isActive ?? undefined,
    },
  });
}

export async function deleteCoupon(id: string, tenantId: string) {
  await getCouponById(id, tenantId);
  return prisma.coupon.delete({ where: { id } });
}

export async function validateCoupon(code: string, tenantId: string, cartTotal?: number) {
  const coupon = await prisma.coupon.findFirst({
    where: { tenantId, code, isActive: true },
  });

  if (!coupon) {
    return { valid: false, error: "Coupon not found" };
  }

  const now = new Date();
  if (now < coupon.startsAt) {
    return { valid: false, error: "Coupon not yet active" };
  }
  if (now > coupon.expiresAt) {
    return { valid: false, error: "Coupon expired" };
  }
  if (coupon.maxUses && coupon.usesCount >= coupon.maxUses) {
    return { valid: false, error: "Coupon usage limit reached" };
  }
  if (coupon.minPurchase && cartTotal !== undefined && cartTotal < Number(coupon.minPurchase)) {
    return { valid: false, error: `Minimum purchase of ${coupon.minPurchase} required` };
  }

  return { valid: true, coupon };
}

export async function incrementCouponUsage(id: string) {
  return prisma.coupon.update({
    where: { id },
    data: { usesCount: { increment: 1 } },
  });
}
