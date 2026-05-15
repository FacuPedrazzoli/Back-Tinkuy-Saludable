import { compare, hash } from "bcryptjs";
import { randomBytes } from "crypto";
import { prisma } from "@lib/prisma";
import {
  AuthenticationError,
  ConflictError,
  ValidationError,
} from "@lib/errors";
import { signAdminToken, signCustomerToken } from "@lib/jwt";
import type { AdminTokenPayload, CustomerTokenPayload } from "@lib/jwt";
import { passwordSchema } from "@lib/validation";
import { logger } from "@lib/logger";
import type { UserType } from "@prisma/client";
import { sendEmail } from "@lib/email";
import { welcomeEmail } from "@emails/welcome";

const SALT_ROUNDS = 12;
const REFRESH_TOKEN_EXPIRY_DAYS = 30;

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

  const valid = await compare(input.password, admin.password);
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

  const hashed = await hash(input.password, SALT_ROUNDS);
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

  const hashed = await hash(input.password, SALT_ROUNDS);
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

  sendEmail(welcomeEmail({ firstName: customer.firstName, email: customer.email })).catch((err) =>
    logger.error({ err, component: "email", type: "welcome" }, "Failed to send welcome email")
  );

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

  const valid = await compare(input.password, customer.password);
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

    const valid = await compare(oldPassword, user.password);
    if (!valid) throw new AuthenticationError("Invalid current password");

    const hashed = await hash(newPassword, SALT_ROUNDS);
    await prisma.customer.update({ where: { id: userId }, data: { password: hashed } });
    return true;
  } else {
    const user = await prisma.adminUser.findUnique({ where: { id: userId } });
    if (!user) throw new AuthenticationError("User not found");

    const valid = await compare(oldPassword, user.password);
    if (!valid) throw new AuthenticationError("Invalid current password");

    const hashed = await hash(newPassword, SALT_ROUNDS);
    await prisma.adminUser.update({ where: { id: userId }, data: { password: hashed } });
    return true;
  }
}

// ─── Refresh Token Rotation ───

export async function generateRefreshToken(
  userId: string,
  userType: "admin" | "customer",
  tenantId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<string> {
  const token = randomBytes(40).toString("hex");
  const familyId = randomBytes(16).toString("hex");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

  await prisma.refreshToken.create({
    data: {
      token,
      userId,
      userType,
      tenantId,
      expiresAt,
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
      familyId,
    },
  });

  await cleanupExpiredRefreshTokens();

  return token;
}

export async function refreshAccessToken(
  refreshToken: string,
  ipAddress?: string,
  userAgent?: string
): Promise<{ accessToken: string; newRefreshToken: string }> {
  const storedToken = await prisma.refreshToken.findUnique({
    where: { token: refreshToken },
  });

  if (!storedToken) {
    throw new AuthenticationError("Invalid refresh token");
  }

  if (storedToken.revokedAt) {
    throw new AuthenticationError("Refresh token has been revoked");
  }

  if (storedToken.expiresAt < new Date()) {
    throw new AuthenticationError("Refresh token has expired");
  }

  if (storedToken.usedAt) {
    const timeSinceUsed = Date.now() - storedToken.usedAt.getTime();
    if (timeSinceUsed > 5000) {
      await revokeAllUserRefreshTokens(storedToken.userId, storedToken.userType as "admin" | "customer");
      logger.warn(
        { userId: storedToken.userId, familyId: storedToken.familyId, ipAddress },
        "Potential token theft detected - all family tokens revoked"
      );
      throw new AuthenticationError("Token theft detected. All sessions have been revoked.");
    }
  }

  const isSameIp = ipAddress && storedToken.ipAddress !== ipAddress;
  const isSameUserAgent = userAgent && storedToken.userAgent !== userAgent;
  if (isSameIp || isSameUserAgent) {
    logger.warn(
      { userId: storedToken.userId, storedIp: storedToken.ipAddress, newIp: ipAddress },
      "Refresh token used from different IP/User-Agent"
    );
  }

  const newAccessToken = await generateAccessToken(storedToken.userId, storedToken.userType as "admin" | "customer");
  const newRefreshToken = await rotateRefreshToken(storedToken, ipAddress, userAgent);

  return { accessToken: newAccessToken, newRefreshToken };
}

async function generateAccessToken(
  userId: string,
  userType: "admin" | "customer"
): Promise<string> {
  if (userType === "admin") {
    const admin = await prisma.adminUser.findUnique({ where: { id: userId } });
    if (!admin) throw new AuthenticationError("User not found");

    const payload: AdminTokenPayload = {
      sub: admin.id,
      role: admin.role as "admin" | "manager",
      tenantId: admin.tenantId,
      branchId: admin.branchId ?? undefined,
    };
    return signAdminToken(payload);
  } else {
    const customer = await prisma.customer.findUnique({ where: { id: userId } });
    if (!customer) throw new AuthenticationError("User not found");

    const payload: CustomerTokenPayload = {
      sub: customer.id,
      role: "customer",
      tenantId: customer.tenantId,
    };
    return signCustomerToken(payload);
  }
}

async function rotateRefreshToken(
  oldToken: { id: string; userId: string; userType: UserType; tenantId: string; familyId: string; },
  ipAddress?: string,
  userAgent?: string
): Promise<string> {
  await prisma.refreshToken.update({
    where: { id: oldToken.id },
    data: {
      usedAt: new Date(),
      revokedAt: new Date(),
    },
  });

  const newToken = randomBytes(40).toString("hex");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

  await prisma.refreshToken.create({
    data: {
      token: newToken,
      userId: oldToken.userId,
      userType: oldToken.userType,
      tenantId: oldToken.tenantId,
      expiresAt,
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
      familyId: oldToken.familyId,
    },
  });

  return newToken;
}

export async function revokeRefreshToken(token: string): Promise<void> {
  const storedToken = await prisma.refreshToken.findUnique({
    where: { token },
  });

  if (!storedToken) return;

  await prisma.refreshToken.update({
    where: { id: storedToken.id },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllUserRefreshTokens(
  userId: string,
  userType: UserType
): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: {
      userId,
      userType,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });
}

async function cleanupExpiredRefreshTokens(): Promise<void> {
  try {
    const result = await prisma.refreshToken.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });
    if (result.count > 0) {
      logger.debug({ count: result.count }, "Cleaned up expired refresh tokens");
    }
  } catch (err) {
    logger.warn({ err }, "Failed to cleanup expired refresh tokens");
  }
}
