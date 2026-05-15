import { prisma } from "@lib/prisma";
import { NotFoundError } from "@lib/errors";

export async function getCustomerProfile(id: string) {
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: { addresses: true },
  });
  if (!customer) throw new NotFoundError("Customer");
  return customer;
}

export async function updateCustomerProfile(
  id: string,
  input: {
    firstName?: string;
    lastName?: string;
    phone?: string | null;
  }
) {
  return prisma.customer.update({
    where: { id },
    data: input,
    include: { addresses: true },
  });
}

// ─── Addresses ───

export async function createAddress(input: {
  customerId: string;
  label: string;
  street: string;
  city: string;
  province: string;
  zipCode: string;
  country?: string;
  isDefault?: boolean;
}) {
  if (input.isDefault) {
    await prisma.customerAddress.updateMany({
      where: { customerId: input.customerId },
      data: { isDefault: false },
    });
  }

  return prisma.customerAddress.create({
    data: {
      customerId: input.customerId,
      label: input.label,
      street: input.street,
      city: input.city,
      province: input.province,
      zipCode: input.zipCode,
      country: input.country ?? "AR",
      isDefault: input.isDefault ?? false,
    },
  });
}

export async function updateAddress(
  id: string,
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
  const address = await prisma.customerAddress.findUnique({ where: { id } });
  if (!address) throw new NotFoundError("Address");

  if (input.isDefault) {
    await prisma.customerAddress.updateMany({
      where: { customerId: address.customerId },
      data: { isDefault: false },
    });
  }

  return prisma.customerAddress.update({
    where: { id },
    data: input,
  });
}

export async function deleteAddress(id: string) {
  return prisma.customerAddress.delete({ where: { id } });
}
