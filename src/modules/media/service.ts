import { prisma } from "@lib/prisma";
import { ValidationError } from "@lib/errors";

function isValidImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export async function createImage(input: {
  productId?: string;
  variantId?: string;
  url: string;
  altText?: string | null;
  sortOrder?: number;
}) {
  if (!input.productId && !input.variantId) {
    throw new Error("Either productId or variantId is required");
  }
  if (!isValidImageUrl(input.url)) {
    throw new ValidationError("Image URL must use HTTP or HTTPS protocol");
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
  input: { url?: string; altText?: string | null; sortOrder?: number }
) {
  if (input.url !== undefined && !isValidImageUrl(input.url)) {
    throw new ValidationError("Image URL must use HTTP or HTTPS protocol");
  }
  return prisma.productImage.update({
    where: { id },
    data: input,
  });
}

export async function deleteImage(id: string) {
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
