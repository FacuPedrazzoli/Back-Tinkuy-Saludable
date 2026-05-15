import { prisma } from "@lib/prisma";
import { ConflictError, NotFoundError, ValidationError } from "@lib/errors";
import { sanitizeSlug } from "@lib/validation";

export async function createTenant(input: {
  name: string;
  slug: string;
  branchName?: string;
}) {
  const slug = sanitizeSlug(input.slug);
  if (!slug) throw new ValidationError("Invalid tenant slug");

  const existing = await prisma.tenant.findUnique({ where: { slug } });
  if (existing) throw new ConflictError("Tenant slug already exists");

  return prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: { name: input.name, slug },
    });

    await tx.branch.create({
      data: {
        tenantId: tenant.id,
        name: input.branchName ?? "Sucursal Principal",
        isActive: true,
      },
    });

    return tenant;
  });
}

export async function getTenantBySlug(slug: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    include: { branches: true },
  });
  if (!tenant) throw new NotFoundError("Tenant");
  return tenant;
}

export async function listTenants(args: { take?: number; skip?: number }) {
  const [items, count] = await Promise.all([
    prisma.tenant.findMany({
      take: args.take ?? 20,
      skip: args.skip ?? 0,
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { branches: true, customers: true } } },
    }),
    prisma.tenant.count(),
  ]);
  return { items, count };
}

export async function updateTenant(
  id: string,
  input: { name?: string; isActive?: boolean }
) {
  return prisma.tenant.update({
    where: { id },
    data: input,
  });
}

// ─── Branches ───

export async function createBranch(input: {
  tenantId: string;
  name: string;
  address?: string;
  phone?: string;
}) {
  return prisma.branch.create({
    data: {
      tenantId: input.tenantId,
      name: input.name,
      address: input.address,
      phone: input.phone,
    },
  });
}

export async function listBranches(tenantId: string) {
  return prisma.branch.findMany({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
  });
}

export async function getBranch(id: string, tenantId: string) {
  const branch = await prisma.branch.findUnique({ where: { id, tenantId } });
  if (!branch) throw new NotFoundError("Branch");
  return branch;
}

export async function updateBranch(
  id: string,
  input: { name?: string; address?: string; phone?: string; isActive?: boolean }
) {
  return prisma.branch.update({
    where: { id },
    data: input,
  });
}
