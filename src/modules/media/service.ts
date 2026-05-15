import { prisma } from "@lib/prisma";
import { ValidationError, NotFoundError, ForbiddenError } from "@lib/errors";

function isValidImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

async function getImageWithTenantCheck(id: string, tenantId: string) {
  const image = await prisma.productImage.findUnique({
    where: { id },
    include: { product: { select: { tenantId: true } }, variant: { select: { product: { select: { tenantId: true } } } } },
  });
  if (!image) throw new NotFoundError("Image");

  const imageTenantId = image.product?.tenantId ?? image.variant?.product?.tenantId;
  if (imageTenantId && imageTenantId !== tenantId) {
    throw new ForbiddenError("Image does not belong to this tenant");
  }
  return image;
}

export async function createImage(input: {
  tenantId: string;
  productId?: string;
  variantId?: string;
  url: string;
  altText?: string | null;
  sortOrder?: number;
}) {
  if (!input.productId && !input.variantId) {
    throw new ValidationError("Either productId or variantId is required");
  }
  if (!isValidImageUrl(input.url)) {
    throw new ValidationError("Image URL must use HTTP or HTTPS protocol");
  }

  if (input.productId) {
    const product = await prisma.product.findUnique({
      where: { id: input.productId },
      select: { tenantId: true },
    });
    if (!product) throw new NotFoundError("Product");
    if (product.tenantId !== input.tenantId) throw new ForbiddenError("Product does not belong to this tenant");
  }

  if (input.variantId) {
    const variant = await prisma.productVariant.findUnique({
      where: { id: input.variantId },
      include: { product: { select: { tenantId: true } } },
    });
    if (!variant) throw new NotFoundError("Variant");
    if (variant.product.tenantId !== input.tenantId) throw new ForbiddenError("Variant does not belong to this tenant");
  }

  return prisma.productImage.create({
    data: {
      productId: input.productId,
      variantId: input.variantId,
      url: input.url,
      altText: input.altText,
      sortOrder: input.sortOrder ?? 0,
    },
  });
}

export async function updateImage(
  id: string,
  input: { url?: string; altText?: string | null; sortOrder?: number },
  tenantId: string
) {
  if (input.url !== undefined && !isValidImageUrl(input.url)) {
    throw new ValidationError("Image URL must use HTTP or HTTPS protocol");
  }
  await getImageWithTenantCheck(id, tenantId);
  return prisma.productImage.update({
    where: { id },
    data: input,
  });
}

export async function deleteImage(id: string, tenantId: string) {
  await getImageWithTenantCheck(id, tenantId);
  return prisma.productImage.delete({ where: { id } });
}

export async function listProductImages(productId: string) {
  return prisma.productImage.findMany({
    where: { productId },
    orderBy: { sortOrder: "asc" },
  });
}

export async function listVariantImages(variantId: string) {
  return prisma.productImage.findMany({
    where: { variantId },
    orderBy: { sortOrder: "asc" },
  });
}
