import bcrypt from "bcryptjs";
import { prisma } from "@lib/prisma";
import {
  AuthenticationError,
  ConflictError,
  ValidationError,
} from "@lib/errors";
import { signAdminToken, signCustomerToken } from "@lib/jwt";
import type { AdminTokenPayload, CustomerTokenPayload } from "@lib/jwt";
import { passwordSchema } from "@lib/validation";

const SALT_ROUNDS = 12;

// ─── Admin Auth ───

export async function adminLogin(input: {
  email: string;
  password: string;
  tenantId: string;
}) {
  const admin = await prisma.adminUser.findUnique({
    where: { tenantId_email: { tenantId: input.tenantId, email: input.email } },
  });

  if (!admin || !admin.isActive) {
    throw new AuthenticationError("Invalid credentials");
  }

  const valid = await bcrypt.compare(input.password, admin.password);
  if (!valid) {
    throw new AuthenticationError("Invalid credentials");
  }

  const payload: AdminTokenPayload = {
    sub: admin.id,
    role: admin.role as "admin" | "manager",
    tenantId: admin.tenantId,
    branchId: admin.branchId ?? undefined,
  };

  return {
    token: signAdminToken(payload),
    user: {
      id: admin.id,
      email: admin.email,
      firstName: admin.firstName,
      lastName: admin.lastName,
      role: admin.role,
      tenantId: admin.tenantId,
    },
  };
}

export async function createAdmin(input: {
  tenantId: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role?: "admin" | "manager";
}) {
  const passwordValidation = passwordSchema.safeParse(input.password);
  if (!passwordValidation.success) {
    throw new ValidationError(passwordValidation.error.errors[0].message);
  }

  const existing = await prisma.adminUser.findUnique({
    where: {
      tenantId_email: { tenantId: input.tenantId, email: input.email },
    },
  });
  if (existing) {
    throw new ConflictError("Email already registered for this tenant");
  }

  const hashed = await bcrypt.hash(input.password, SALT_ROUNDS);
  return prisma.adminUser.create({
    data: {
      tenantId: input.tenantId,
      email: input.email,
      password: hashed,
      firstName: input.firstName,
      lastName: input.lastName,
      role: input.role ?? "manager",
    },
  });
}

// ─── Customer Auth ───

export async function customerRegister(input: {
  tenantId: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
}) {
  const passwordValidation = passwordSchema.safeParse(input.password);
  if (!passwordValidation.success) {
    throw new ValidationError(passwordValidation.error.errors[0].message);
  }

  const existing = await prisma.customer.findUnique({
    where: {
      tenantId_email: { tenantId: input.tenantId, email: input.email },
    },
  });
  if (existing) {
    throw new ConflictError("Email already registered");
  }

  const hashed = await bcrypt.hash(input.password, SALT_ROUNDS);
  const customer = await prisma.customer.create({
    data: {
      tenantId: input.tenantId,
      email: input.email,
      password: hashed,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
    },
  });

  const payload: CustomerTokenPayload = {
    sub: customer.id,
    role: "customer",
    tenantId: customer.tenantId,
  };

  return {
    token: signCustomerToken(payload),
    customer: {
      id: customer.id,
      email: customer.email,
      firstName: customer.firstName,
      lastName: customer.lastName,
    },
  };
}

export async function customerLogin(input: {
  email: string;
  password: string;
  tenantId: string;
}) {
  const customer = await prisma.customer.findUnique({
    where: {
      tenantId_email: { tenantId: input.tenantId, email: input.email },
    },
  });

  if (!customer || !customer.isActive) {
    throw new AuthenticationError("Invalid credentials");
  }

  const valid = await bcrypt.compare(input.password, customer.password);
  if (!valid) {
    throw new AuthenticationError("Invalid credentials");
  }

  const payload: CustomerTokenPayload = {
    sub: customer.id,
    role: "customer",
    tenantId: customer.tenantId,
  };

  return {
    token: signCustomerToken(payload),
    customer: {
      id: customer.id,
      email: customer.email,
      firstName: customer.firstName,
      lastName: customer.lastName,
    },
  };
}

export async function findAdminById(id: string) {
  return prisma.adminUser.findUnique({ where: { id } });
}

export async function findCustomerById(id: string) {
  return prisma.customer.findUnique({ where: { id } });
}

export async function changePassword(
  userId: string,
  role: "admin" | "manager" | "customer",
  oldPassword: string,
  newPassword: string
) {
  const passwordValidation = passwordSchema.safeParse(newPassword);
  if (!passwordValidation.success) {
    throw new ValidationError(passwordValidation.error.errors[0].message);
  }

  if (role === "customer") {
    const user = await prisma.customer.findUnique({ where: { id: userId } });
    if (!user) throw new AuthenticationError("User not found");

    const valid = await bcrypt.compare(oldPassword, user.password);
    if (!valid) throw new AuthenticationError("Invalid current password");

    const hashed = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await prisma.customer.update({ where: { id: userId }, data: { password: hashed } });
    return true;
  } else {
    const user = await prisma.adminUser.findUnique({ where: { id: userId } });
    if (!user) throw new AuthenticationError("User not found");

    const valid = await bcrypt.compare(oldPassword, user.password);
    if (!valid) throw new AuthenticationError("Invalid current password");

    const hashed = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await prisma.adminUser.update({ where: { id: userId }, data: { password: hashed } });
    return true;
  }
}
