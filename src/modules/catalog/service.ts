import { prisma } from "@lib/prisma";
import { NotFoundError, ValidationError, ForbiddenError } from "@lib/errors";
import { sanitizeSlug, sanitizeString } from "@lib/validation";
import { getStockCached, getBatchStockCached, type BatchStockKey } from "@lib/cache";
import { queryCache, PRODUCT_CACHE_TTL } from "@lib/query-cache";
import { Prisma } from "@prisma/client";

interface ProductCreateInput {
  tenantId: string;
  name: string;
  slug?: string;
  description?: string | null;
  sku?: string | null;
  basePrice: number;
  tagIds?: string[];
  supplierIds?: string[];
}

// ─── Products ───

export async function createProduct(input: ProductCreateInput) {
  const slug = sanitizeSlug(input.slug || input.name);

  const existingSlug = await prisma.product.findFirst({
    where: { tenantId: input.tenantId, slug },
  });
  if (existingSlug) {
    throw new ValidationError(`Product with slug "${slug}" already exists`);
  }

  if (input.tagIds?.length) {
    const tags = await prisma.tag.findMany({
      where: { id: { in: input.tagIds }, tenantId: input.tenantId },
    });
    if (tags.length !== input.tagIds.length) {
      throw new ValidationError("One or more tags do not belong to this tenant");
    }
  }

  if (input.supplierIds?.length) {
    const suppliers = await prisma.supplier.findMany({
      where: { id: { in: input.supplierIds }, tenantId: input.tenantId },
    });
    if (suppliers.length !== input.supplierIds.length) {
      throw new ValidationError("One or more suppliers do not belong to this tenant");
    }
  }

  return prisma.product.create({
    data: {
      tenantId: input.tenantId,
      name: input.name,
      slug,
      description: sanitizeString(input.description),
      sku: input.sku,
      basePrice: input.basePrice,
      tags: input.tagIds?.length
        ? { create: input.tagIds.map((tagId) => ({ tag: { connect: { id: tagId } } })) }
        : undefined,
      suppliers: input.supplierIds?.length
        ? {
            create: input.supplierIds.map((supplierId) => ({
              supplier: { connect: { id: supplierId } },
            })),
          }
        : undefined,
    },
    include: { variants: true, tags: { include: { tag: true } }, images: true },
  });
}

export async function getProduct(id: string, tenantId: string, activeOnly = false) {
  const cacheKey = `product:${id}:${tenantId}:${activeOnly}`;
  const cached = await queryCache.get<NonNullable<ReturnType<typeof prisma.product.findUnique>>>(cacheKey);
  if (cached) return cached;

  const where: Prisma.ProductWhereUniqueInput = { id, tenantId };
  if (activeOnly) {
    where.isActive = true;
    where.isVisible = true;
  }
  const product = await prisma.product.findUnique({
    where,
    include: {
      variants: true,
      attributes: true,
      images: true,
      tags: { include: { tag: true } },
      suppliers: { include: { supplier: true } },
    },
  });
  if (!product) throw new NotFoundError("Product");

  await queryCache.set(cacheKey, product, { ttlSeconds: PRODUCT_CACHE_TTL });
  return product;
}

export async function listProducts(args: {
  tenantId: string;
  search?: string;
  tagSlug?: string;
  isVisible?: boolean;
  take?: number;
  skip?: number;
}) {
  const where: Prisma.ProductWhereInput = { tenantId: args.tenantId };

  if (args.isVisible !== undefined) where.isVisible = args.isVisible;
  if (args.search) {
    where.name = { contains: args.search, mode: "insensitive" };
  }
  if (args.tagSlug) {
    where.tags = { some: { tag: { slug: args.tagSlug } } };
  }

  const take = Math.min(args.take ?? 20, 100);
  const skip = args.skip ?? 0;

  const cacheKey = `products:list:${args.tenantId}:${JSON.stringify(where)}:${take}:${skip}`;
  const cached = await queryCache.get<{ items: NonNullable<ReturnType<typeof prisma.product.findMany>>; count: number }>(cacheKey);
  if (cached) return cached;

  const [items, count] = await Promise.all([
    prisma.product.findMany({
      where,
      take,
      skip,
      orderBy: { createdAt: "desc" },
      include: {
        variants: true,
        images: { orderBy: { sortOrder: "asc" }, take: 1 },
        tags: { include: { tag: true } },
      },
    }),
    prisma.product.count({ where }),
  ]);

  const result = { items, count };
  await queryCache.set(cacheKey, result, { ttlSeconds: PRODUCT_CACHE_TTL });
  return result;
}

export async function updateProduct(
  id: string,
  input: {
    tenantId: string;
    name?: string;
    slug?: string;
    description?: string | null;
    sku?: string | null;
    basePrice?: number;
    isActive?: boolean;
    isVisible?: boolean;
    tagIds?: string[];
  }
) {
  const product = await prisma.product.findUnique({
    where: { id },
    select: { tenantId: true },
  });
  if (!product) throw new NotFoundError("Product");
  if (product.tenantId !== input.tenantId) throw new ForbiddenError("Product does not belong to this tenant");

  const data: Prisma.ProductUpdateInput = { ...input };
  delete (data as Record<string, unknown>).tenantId;
  if (input.slug) data.slug = sanitizeSlug(input.slug);
  if (input.description !== undefined) data.description = sanitizeString(input.description);

  if (input.tagIds) {
    data.tags = {
      deleteMany: {},
      create: input.tagIds.map((tagId) => ({ tag: { connect: { id: tagId } } })),
    };
  }

  return prisma.product.update({
    where: { id },
    data,
    include: { variants: true, tags: { include: { tag: true } }, images: true },
  });
}

export async function deleteProduct(id: string, tenantId: string) {
  const product = await prisma.product.findUnique({
    where: { id },
    select: { tenantId: true },
  });
  if (!product) throw new NotFoundError("Product");
  if (product.tenantId !== tenantId) throw new ForbiddenError("Product does not belong to this tenant");
  return prisma.product.update({
    where: { id },
    data: { isActive: false, isVisible: false },
  });
}

// ─── Variants ───

export async function createVariant(input: {
  productId: string;
  sku: string;
  name: string;
  price: number;
}, tenantId: string) {
  const product = await prisma.product.findUnique({
    where: { id: input.productId },
    select: { tenantId: true },
  });
  if (!product) throw new NotFoundError("Product");
  if (product.tenantId !== tenantId) throw new ForbiddenError("Product does not belong to this tenant");

  return prisma.productVariant.create({
    data: {
      productId: input.productId,
      sku: input.sku,
      name: input.name,
      price: input.price,
    },
    include: { product: true, attributes: true, images: true },
  });
}

export async function updateVariant(
  id: string,
  input: { sku?: string; name?: string; price?: number; isActive?: boolean },
  tenantId: string
) {
  const variant = await prisma.productVariant.findUnique({
    where: { id },
    include: { product: true },
  });
  if (!variant) throw new NotFoundError("Variant");
  if (variant.product.tenantId !== tenantId) throw new ForbiddenError("Variant does not belong to this tenant");

  return prisma.productVariant.update({
    where: { id },
    data: input,
    include: { product: true },
  });
}

export async function deleteVariant(id: string, tenantId: string) {
  const variant = await prisma.productVariant.findUnique({
    where: { id },
    include: { product: true },
  });
  if (!variant) throw new NotFoundError("Variant");
  if (variant.product.tenantId !== tenantId) throw new ForbiddenError("Variant does not belong to this tenant");

  return prisma.productVariant.update({
    where: { id },
    data: { isActive: false },
  });
}

// ─── Tags ───

export async function createTag(input: { tenantId: string; name: string; slug?: string }) {
  const slug = sanitizeSlug(input.slug || input.name);
  return prisma.tag.create({
    data: { tenantId: input.tenantId, name: input.name, slug },
  });
}

export async function listTags(tenantId: string, args: { take?: number; skip?: number } = {}) {
  const take = Math.min(args.take ?? 100, 100);
  return prisma.tag.findMany({
    where: { tenantId },
    take,
    skip: args.skip ?? 0,
    orderBy: { name: "asc" },
    include: { _count: { select: { products: true } } },
  });
}

export async function updateTag(id: string, input: { name?: string; slug?: string }) {
  const data: Prisma.TagUpdateInput = { ...input };
  if (input.slug) data.slug = sanitizeSlug(input.slug);
  return prisma.tag.update({ where: { id }, data });
}

export async function deleteTag(id: string) {
  return prisma.tag.delete({ where: { id } });
}

// ─── Suppliers ───

export async function createSupplier(input: {
  tenantId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
}) {
  return prisma.supplier.create({
    data: {
      tenantId: input.tenantId,
      name: input.name,
      email: input.email,
      phone: input.phone,
      address: input.address,
    },
  });
}

export async function listSuppliers(tenantId: string, args: { take?: number; skip?: number } = {}) {
  return prisma.supplier.findMany({
    where: { tenantId },
    take: args.take ?? 100,
    skip: args.skip ?? 0,
    orderBy: { name: "asc" },
  });
}

export async function updateSupplier(
  id: string,
  input: { name?: string; email?: string; phone?: string; address?: string }
) {
  return prisma.supplier.update({ where: { id }, data: input });
}

export async function deleteSupplier(id: string) {
  return prisma.supplier.delete({ where: { id } });
}

// ─── Attributes ───

export async function createAttribute(input: {
  tenantId: string;
  productId?: string;
  variantId?: string;
  key: string;
  value: string;
}) {
  if (!input.productId && !input.variantId) {
    throw new ValidationError("Either productId or variantId is required");
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

  return prisma.productAttribute.create({
    data: {
      productId: input.productId,
      variantId: input.variantId,
      key: input.key,
      value: input.value,
    },
  });
}

export async function deleteAttribute(id: string) {
  return prisma.productAttribute.delete({ where: { id } });
}

// ─── Stock helpers ───

export async function getProductStock(productId: string, branchId: string) {
  const result = await getStockCached(productId, branchId, null);
  return result.found ? result.value : null;
}

export async function getVariantStock(variantId: string, branchId: string) {
  const result = await getStockCached(variantId, branchId, variantId);
  return result.found ? result.value : null;
}

export async function getBatchProductStock(
  items: { productId: string; branchId: string }[]
): Promise<(number | null)[]> {
  if (items.length === 0) return [];
  const keys: BatchStockKey[] = items.map((item) => ({
    productId: item.productId,
    branchId: item.branchId,
  }));
  return getBatchStockCached(keys);
}
