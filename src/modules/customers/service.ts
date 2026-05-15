import { prisma } from "@lib/prisma";
import { NotFoundError } from "@lib/errors";
import { queryCache, CUSTOMER_CACHE_TTL } from "@lib/query-cache";

export async function getAddressById(id: string, tenantId: string) {
  const address = await prisma.customerAddress.findFirst({
    where: { id, customer: { tenantId } },
    include: { customer: { select: { tenantId: true } } },
  });
  if (!address) throw new NotFoundError("Address");
  return address;
}

export async function getCustomerProfile(id: string, tenantId: string) {
  const cacheKey = `customer:${tenantId}:${id}`;
  const cached = await queryCache.get<NonNullable<ReturnType<typeof prisma.customer.findUnique>>>(cacheKey);
  if (cached) return cached;

  const customer = await prisma.customer.findFirst({
    where: { id, tenantId },
    include: { addresses: { take: 20, orderBy: { createdAt: "desc" } } },
  });
  if (!customer) throw new NotFoundError("Customer");

  await queryCache.set(cacheKey, customer, { ttlSeconds: CUSTOMER_CACHE_TTL });
  return customer;
}

export async function updateCustomerProfile(
  id: string,
  tenantId: string,
  input: {
    firstName?: string;
    lastName?: string;
    phone?: string | null;
  }
) {
  const customer = await prisma.customer.update({
    where: { id, tenantId },
    data: input,
    include: { addresses: { take: 20, orderBy: { createdAt: "desc" } } },
  });

  await queryCache.invalidate(`customer:${tenantId}:${id}`);
  return customer;
}

// ─── Addresses ───

export async function createAddress(
  customerId: string,
  tenantId: string,
  input: {
    label: string;
    street: string;
    city: string;
    province: string;
    zipCode: string;
    country?: string;
    isDefault?: boolean;
  }
) {
  const customer = await prisma.customer.findFirst({ where: { id: customerId, tenantId } });
  if (!customer) throw new NotFoundError("Customer");

  return prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.customerAddress.updateMany({
        where: { customerId, customer: { tenantId } },
        data: { isDefault: false },
      });
    }

    return tx.customerAddress.create({
      data: {
        customerId,
        label: input.label,
        street: input.street,
        city: input.city,
        province: input.province,
        zipCode: input.zipCode,
        country: input.country ?? "AR",
        isDefault: input.isDefault ?? false,
      },
    });
  });
}

export async function updateAddress(
  id: string,
  tenantId: string,
  input: {
    label?: string;
    street?: string;
    city?: string;
    province?: string;
    zipCode?: string;
    country?: string;
    isDefault?: boolean;
  }
) {
  return prisma.$transaction(async (tx) => {
    const address = await tx.customerAddress.findFirst({
      where: { id, customer: { tenantId } },
    });
    if (!address) throw new NotFoundError("Address");

    if (input.isDefault) {
      await tx.customerAddress.updateMany({
        where: { customerId: address.customerId, customer: { tenantId } },
        data: { isDefault: false },
      });
    }

    return tx.customerAddress.update({
      where: { id },
      data: input,
    });
  });
}

export async function deleteAddress(id: string, tenantId: string) {
  const address = await prisma.customerAddress.findFirst({
    where: { id, customer: { tenantId } },
  });
  if (!address) throw new NotFoundError("Address");

  return prisma.customerAddress.delete({ where: { id } });
}
