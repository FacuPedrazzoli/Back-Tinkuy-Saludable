import { prisma } from "@lib/prisma";
import { NotFoundError, ValidationError } from "@lib/errors";

export async function listCategories(tenantId: string) {
  const categories = await prisma.category.findMany({
    where: { tenantId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      _count: {
        select: { children: true },
      },
    },
  });

  const categoriesWithCounts = await Promise.all(
    categories.map(async (cat) => {
      const productCount = await prisma.product.count({
        where: { tenantId, isActive: true },
      });
      return {
        ...cat,
        productCount,
      };
    })
  );

  return categoriesWithCounts;
}

export async function getCategoryById(id: string, tenantId: string) {
  const category = await prisma.category.findUnique({
    where: { id, tenantId },
    include: { children: true },
  });
  if (!category) throw new NotFoundError("Category");
  return category;
}

export async function createCategory(input: {
  tenantId: string;
  name: string;
  slug?: string;
  description?: string | null;
  imageUrl?: string | null;
  parentId?: string | null;
  sortOrder?: number;
}) {
  const slug = input.slug ?? input.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

  if (input.parentId) {
    const parent = await prisma.category.findUnique({
      where: { id: input.parentId, tenantId: input.tenantId },
    });
    if (!parent) throw new NotFoundError("Parent category");
  }

  return prisma.category.create({
    data: {
      tenantId: input.tenantId,
      name: input.name,
      slug,
      description: input.description,
      imageUrl: input.imageUrl,
      parentId: input.parentId,
      sortOrder: input.sortOrder ?? 0,
    },
  });
}

export async function updateCategory(
  id: string,
  input: {
    name?: string;
    slug?: string;
    description?: string | null;
    imageUrl?: string | null;
    parentId?: string | null;
    sortOrder?: number;
    isActive?: boolean;
  },
  tenantId: string
) {
  const category = await getCategoryById(id, tenantId);

  if (input.parentId && input.parentId !== category.id) {
    const parent = await prisma.category.findUnique({
      where: { id: input.parentId, tenantId },
    });
    if (!parent) throw new NotFoundError("Parent category");

    const isDescendant = await checkIsDescendant(input.parentId, id, tenantId);
    if (isDescendant) {
      throw new ValidationError("Category cannot be its own descendant");
    }
  }

  return prisma.category.update({
    where: { id },
    data: {
      name: input.name ?? undefined,
      slug: input.slug ?? undefined,
      description: input.description ?? undefined,
      imageUrl: input.imageUrl ?? undefined,
      parentId: input.parentId !== undefined ? input.parentId : undefined,
      sortOrder: input.sortOrder ?? undefined,
      isActive: input.isActive ?? undefined,
    },
  });
}

async function checkIsDescendant(parentId: string, childId: string, tenantId: string): Promise<boolean> {
  const children = await prisma.category.findMany({
    where: { parentId, tenantId },
    select: { id: true },
  });

  for (const child of children) {
    if (child.id === childId) return true;
    const isDescendant = await checkIsDescendant(child.id, childId, tenantId);
    if (isDescendant) return true;
  }
  return false;
}

export async function deleteCategory(id: string, tenantId: string) {
  await getCategoryById(id, tenantId);

  await prisma.category.updateMany({
    where: { parentId: id, tenantId },
    data: { parentId: null },
  });

  return prisma.category.delete({ where: { id } });
}

export async function reorderCategories(tenantId: string, orderedIds: string[]) {
  await Promise.all(
    orderedIds.map((id, index) =>
      prisma.category.updateMany({
        where: { id, tenantId },
        data: { sortOrder: index },
      })
    )
  );

  return listCategories(tenantId);
}
