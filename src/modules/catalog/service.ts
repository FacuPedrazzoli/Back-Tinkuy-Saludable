import { PrismaClient, Prisma } from '@prisma/client';
import { redis } from '@lib/redis';

const prisma = new PrismaClient();

const CACHE_TTL = 300;

interface ListProductsArgs {
  tenantId: string;
  search?: string;
  tagSlug?: string;
  isVisible?: boolean;
  take?: number;
  skip?: number;
}

export async function listProducts(args: ListProductsArgs) {
  const where: Prisma.ProductWhereInput = {
    tenantId: args.tenantId,
  };

  if (args.isVisible !== undefined) {
    where.isVisible = args.isVisible;
  }

  if (args.search) {
    where.OR = [
      { name: { contains: args.search, mode: 'insensitive' } },
      { description: { contains: args.search, mode: 'insensitive' } },
      { sku: { contains: args.search, mode: 'insensitive' } },
    ];
  }

  if (args.tagSlug) {
    where.tags = {
      some: {
        tag: { slug: args.tagSlug },
      },
    };
  }

  const [items, count] = await Promise.all([
    prisma.product.findMany({
      where,
      include: {
        images: { where: { productId: { not: null } }, take: 1, orderBy: { position: 'asc' } },
        tags: { include: { tag: true } },
      },
      take: args.take ?? 20,
      skip: args.skip ?? 0,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.product.count({ where }),
  ]);

  return { items, count };
}

export async function getProduct(id: string, tenantId: string, _includeReviews = false) {
  const product = await prisma.product.findFirst({
    where: { id, tenantId },
    include: {
      images: { orderBy: { position: 'asc' } },
      variants: { where: { isActive: true }, include: { images: true, attributes: true } },
      attributes: true,
      tags: { include: { tag: true } },
      suppliers: { include: { supplier: true } },
    },
  });

  if (!product) {
    throw new Error(`Product with id ${id} not found`);
  }

  return product;
}

export async function listTags(tenantId: string) {
  return prisma.tag.findMany({
    where: { tenantId },
    orderBy: { name: 'asc' },
  });
}

export async function listSuppliers(tenantId: string) {
  return prisma.supplier.findMany({
    where: { tenantId },
    orderBy: { name: 'asc' },
  });
}

interface CreateProductArgs {
  tenantId: string;
  name: string;
  slug?: string;
  description?: string;
  sku?: string;
  basePrice: number;
  tagIds?: string[];
  supplierIds?: string[];
}

export async function createProduct(args: CreateProductArgs) {
  const { tagIds, supplierIds, ...productData } = args;

  return prisma.product.create({
    data: {
      tenantId: productData.tenantId,
      name: productData.name,
      slug: productData.slug ?? `${productData.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
      description: productData.description,
      sku: productData.sku,
      basePrice: productData.basePrice,
      tags: tagIds ? { create: tagIds.map((tagId) => ({ tagId })) } : undefined,
      suppliers: supplierIds ? { create: supplierIds.map((supplierId) => ({ supplierId })) } : undefined,
    },
    include: {
      images: true,
      tags: { include: { tag: true } },
      suppliers: { include: { supplier: true } },
    },
  });
}

interface UpdateProductArgs {
  tenantId: string;
  name?: string;
  slug?: string;
  description?: string;
  sku?: string;
  basePrice?: number;
  isActive?: boolean;
  isVisible?: boolean;
  tagIds?: string[];
}

export async function updateProduct(id: string, args: UpdateProductArgs) {
  const { tagIds, ...productData } = args;

  const product = await prisma.product.update({
    where: { id },
    data: {
      ...productData,
      tags: tagIds
        ? {
            deleteMany: {},
            create: tagIds.map((tagId) => ({ tagId })),
          }
        : undefined,
    },
    include: {
      images: true,
      tags: { include: { tag: true } },
      suppliers: { include: { supplier: true } },
    },
  });

  return product;
}

export async function deleteProduct(id: string, tenantId: string) {
  return prisma.product.delete({ where: { id, tenantId } });
}

interface CreateVariantArgs {
  productId: string;
  sku: string;
  name: string;
  price: number;
}

export async function createVariant(args: CreateVariantArgs, _tenantId: string) {
  return prisma.productVariant.create({
    data: {
      productId: args.productId,
      sku: args.sku,
      name: args.name,
      price: args.price,
    },
    include: { images: true, attributes: true },
  });
}

interface UpdateVariantArgs {
  sku?: string;
  name?: string;
  price?: number;
  isActive?: boolean;
}

export async function updateVariant(id: string, args: UpdateVariantArgs, _tenantId: string) {
  return prisma.productVariant.update({
    where: { id },
    data: args,
    include: { images: true, attributes: true },
  });
}

export async function deleteVariant(id: string, _tenantId: string) {
  return prisma.productVariant.delete({ where: { id } });
}

interface CreateTagArgs {
  tenantId: string;
  name: string;
  slug?: string;
}

export async function createTag(args: CreateTagArgs) {
  return prisma.tag.create({
    data: {
      tenantId: args.tenantId,
      name: args.name,
      slug: args.slug ?? `${args.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
    },
  });
}

interface CreateSupplierArgs {
  tenantId: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
}

export async function createSupplier(args: CreateSupplierArgs) {
  return prisma.supplier.create({
    data: args,
  });
}

interface CreateAttributeArgs {
  tenantId: string;
  productId?: string;
  variantId?: string;
  key: string;
  value: string;
}

export async function createAttribute(args: CreateAttributeArgs) {
  return prisma.productAttribute.create({
    data: {
      key: args.key,
      value: args.value,
      productId: args.productId,
      variantId: args.variantId,
    },
  });
}

interface GetProductsArgs {
  categoryId?: string;
  minPrice?: number;
  maxPrice?: number;
  isOrganic?: boolean;
  isVegan?: boolean;
  isGlutenFree?: boolean;
  search?: string;
  orderBy?: 'price_asc' | 'price_desc' | 'name_asc' | 'rating' | 'newest';
  first?: number;
  skip?: number;
  isFeatured?: boolean;
  tenantId?: string;
}

function getOrderBy(orderBy?: string): Prisma.ProductOrderByWithRelationInput | undefined {
  switch (orderBy) {
    case 'price_asc':
      return { basePrice: 'asc' };
    case 'price_desc':
      return { basePrice: 'desc' };
    case 'name_asc':
      return { name: 'asc' };
    case 'newest':
      return { createdAt: 'desc' };
    default:
      return undefined;
  }
}

function buildWhereClause(args: GetProductsArgs): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = {
    isActive: true,
    isVisible: true,
  };

  if (args.tenantId) {
    where.tenantId = args.tenantId;
  }

  if (args.categoryId) {
    where.categoryId = args.categoryId;
  }

  if (args.isFeatured !== undefined) {
    where.isFeatured = args.isFeatured;
  }

  if (args.minPrice !== undefined || args.maxPrice !== undefined) {
    where.basePrice = {};
    if (args.minPrice !== undefined) {
      where.basePrice.gte = args.minPrice;
    }
    if (args.maxPrice !== undefined) {
      where.basePrice.lte = args.maxPrice;
    }
  }

  if (args.isOrganic || args.isVegan || args.isGlutenFree) {
    where.attributes = {
      some: {
        AND: [
          ...(args.isOrganic ? [{ key: 'organic', value: 'true' }] : []),
          ...(args.isVegan ? [{ key: 'vegan', value: 'true' }] : []),
          ...(args.isGlutenFree ? [{ key: 'glutenFree', value: 'true' }] : []),
        ],
      },
    };
  }

  if (args.search) {
    where.OR = [
      { name: { contains: args.search, mode: 'insensitive' } },
      { description: { contains: args.search, mode: 'insensitive' } },
      { sku: { contains: args.search, mode: 'insensitive' } },
    ];
  }

  return where;
}

export async function getProducts(args: GetProductsArgs) {
  const cacheKey = `products:${JSON.stringify(args)}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (err) {
    console.warn('Redis cache miss or error:', err);
  }

  const where = buildWhereClause(args);
  const orderBy = getOrderBy(args.orderBy);
  const first = args.first || 20;
  const skip = args.skip || 0;

  const [products, totalCount] = await Promise.all([
    prisma.product.findMany({
      where,
      include: {
        images: {
          where: { productId: { not: null } },
          take: 1,
          orderBy: { position: 'asc' },
        },
        category: true,
        attributes: true,
        reviews: {
          where: { isApproved: true },
          select: { rating: true },
        },
      },
      orderBy,
      take: first,
      skip,
    }),
    prisma.product.count({ where }),
  ]);

  const productsWithRating = products.map((product) => {
    const reviews = (product as { reviews: { rating: number }[] }).reviews;
    return {
      ...product,
      averageRating:
        reviews.length > 0
          ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
          : null,
      reviewCount: reviews.length,
      reviews: undefined,
    };
  });

  const result = {
    products: productsWithRating,
    totalCount,
    hasMore: skip + products.length < totalCount,
  };

  try {
    await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result));
  } catch (err) {
    console.warn('Redis cache set error:', err);
  }

  return result;
}

export async function getProductBySlug(slug: string, tenantId: string) {
  const cacheKey = `product:${tenantId}:${slug}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (err) {
    console.warn('Redis cache miss or error:', err);
  }

  const product = await prisma.product.findFirst({
    where: {
      slug,
      tenantId,
      isActive: true,
      isVisible: true,
    },
    include: {
      images: {
        orderBy: { position: 'asc' },
      },
      category: true,
      attributes: true,
      variants: {
        where: { isActive: true },
        include: {
          attributes: true,
          images: true,
        },
      },
      reviews: {
        where: { isApproved: true },
        include: {
          customer: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
      suppliers: {
        select: {
          supplier: { select: { name: true } },
        },
      },
    },
  });

  if (!product) {
    return null;
  }

  const averageRating =
    product.reviews.length > 0
      ? product.reviews.reduce((sum, r) => sum + r.rating, 0) / product.reviews.length
      : null;

  const result = {
    ...product,
    averageRating,
    reviewCount: product.reviews.length,
  };

  try {
    await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result));
  } catch (err) {
    console.warn('Redis cache set error:', err);
  }

  return result;
}

export async function getRelatedProducts(productId: string, categoryId: string | null, tenantId: string) {
  const cacheKey = `related:${tenantId}:${productId}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (err) {
    console.warn('Redis cache miss or error:', err);
  }

  const where: Prisma.ProductWhereInput = {
    tenantId,
    isActive: true,
    isVisible: true,
    id: { not: productId },
    ...(categoryId ? { categoryId } : {}),
  };

  const [products, totalCount] = await Promise.all([
    prisma.product.findMany({
      where,
      include: {
        images: {
          take: 1,
          orderBy: { position: 'asc' },
        },
        attributes: true,
      },
      take: 4,
      orderBy: { isFeatured: 'desc' },
    }),
    prisma.product.count({ where }),
  ]);

  const result = {
    products,
    totalCount,
    hasMore: products.length < totalCount,
  };

  try {
    await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result));
  } catch (err) {
    console.warn('Redis cache set error:', err);
  }

  return result;
}

export async function invalidateProductCache(tenantId: string, slug?: string) {
  const pattern = `products:*`;
  const keys = await redis.keys(pattern);

  if (keys.length > 0) {
    await redis.del(...keys);
  }

  if (slug) {
    await redis.del(`product:${tenantId}:${slug}`);
    await redis.del(`related:${tenantId}:${slug}`);
  }
}

export async function searchProducts(query: string, tenantId: string, first = 10) {
  const cacheKey = `search:${tenantId}:${query}:${first}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (err) {
    console.warn('Redis cache miss or error:', err);
  }

  const products = await prisma.product.findMany({
    where: {
      tenantId,
      isActive: true,
      isVisible: true,
      OR: [
        { name: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
        { sku: { contains: query, mode: 'insensitive' } },
      ],
    },
    include: {
      images: {
        take: 1,
        orderBy: { position: 'asc' },
      },
      category: true,
    },
    take: first,
    orderBy: { name: 'asc' },
  });

  try {
    await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(products));
  } catch (err) {
    console.warn('Redis cache set error:', err);
  }

  return products;
}

export { redis, prisma };
