import { describe, it, expect, vi, beforeEach } from "vitest";
import { hashSync } from "bcryptjs";

const mockAdminUser = {
  id: "admin-1",
  email: "admin@test.com",
  password: hashSync("Admin123!", 12),
  firstName: "Admin",
  lastName: "User",
  role: "admin",
  tenantId: "tenant-1",
  isActive: true,
  branchId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockCustomer = {
  id: "cust-1",
  email: "customer@test.com",
  firstName: "John",
  lastName: "Doe",
  tenantId: "tenant-1",
  isActive: true,
  password: hashSync("Customer123!", 12),
  phone: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

vi.mock("@lib/prisma", () => ({
  prisma: {
    adminUser: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    customer: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@lib/jwt", () => ({
  signAdminToken: () => "admin-token",
  signCustomerToken: () => "customer-token",
}));

import { prisma } from "@lib/prisma";
import {
  adminLogin,
  customerLogin,
  customerRegister,
  changePassword,
  findAdminById,
  findCustomerById,
  createAdmin,
} from "@modules/auth/service";

const mockedPrisma = vi.mocked(prisma);

describe("Auth Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("adminLogin", () => {
    it("returns token for valid credentials", async () => {
      vi.mocked(mockedPrisma.adminUser.findUnique).mockResolvedValue(mockAdminUser);

      const result = await adminLogin({
        email: "admin@test.com",
        password: "Admin123!",
        tenantId: "tenant-1",
      });

      expect(result.token).toBe("admin-token");
      expect(result.user.email).toBe("admin@test.com");
      expect(mockedPrisma.adminUser.findUnique).toHaveBeenCalledWith({
        where: { tenantId_email: { tenantId: "tenant-1", email: "admin@test.com" } },
      });
    });

    it("throws for invalid credentials", async () => {
      vi.mocked(mockedPrisma.adminUser.findUnique).mockResolvedValue(null);

      await expect(
        adminLogin({ email: "bad@test.com", password: "wrong", tenantId: "tenant-1" })
      ).rejects.toThrow("Invalid credentials");
    });

    it("throws for inactive admin", async () => {
      vi.mocked(mockedPrisma.adminUser.findUnique).mockResolvedValue({
        ...mockAdminUser,
        isActive: false,
      });

      await expect(
        adminLogin({ email: "admin@test.com", password: "Admin123!", tenantId: "tenant-1" })
      ).rejects.toThrow("Invalid credentials");
    });
  });

  describe("createAdmin", () => {
    it("creates admin successfully", async () => {
      vi.mocked(mockedPrisma.adminUser.findUnique).mockResolvedValue(null);
      vi.mocked(mockedPrisma.adminUser.create).mockResolvedValue({
        id: "admin-new",
        email: "newadmin@test.com",
        firstName: "New",
        lastName: "Admin",
        role: "manager",
        tenantId: "tenant-1",
        isActive: true,
        password: "hashed",
        branchId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await createAdmin({
        tenantId: "tenant-1",
        email: "newadmin@test.com",
        password: "Admin123!",
        firstName: "New",
        lastName: "Admin",
        role: "manager",
      });

      expect(result.email).toBe("newadmin@test.com");
      expect(mockedPrisma.adminUser.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: "newadmin@test.com",
          firstName: "New",
          lastName: "Admin",
          role: "manager",
          tenantId: "tenant-1",
        }),
      });
    });

    it("throws for duplicate email", async () => {
      vi.mocked(mockedPrisma.adminUser.findUnique).mockResolvedValue(mockAdminUser);

      await expect(
        createAdmin({
          tenantId: "tenant-1",
          email: "admin@test.com",
          password: "Admin123!",
          firstName: "New",
          lastName: "Admin",
        })
      ).rejects.toThrow("Email already registered for this tenant");
    });

    it("throws for short password", async () => {
      vi.mocked(mockedPrisma.adminUser.findUnique).mockResolvedValue(null);

      await expect(
        createAdmin({
          tenantId: "tenant-1",
          email: "newadmin@test.com",
          password: "short",
          firstName: "New",
          lastName: "Admin",
        })
      ).rejects.toThrow("Mínimo 8 caracteres");
    });
  });

  describe("customerLogin", () => {
    it("returns token for valid credentials", async () => {
      vi.mocked(mockedPrisma.customer.findUnique).mockResolvedValue(mockCustomer);

      const result = await customerLogin({
        email: "customer@test.com",
        password: "Customer123!",
        tenantId: "tenant-1",
      });

      expect(result.token).toBe("customer-token");
      expect(result.customer.email).toBe("customer@test.com");
    });

    it("throws for invalid credentials", async () => {
      vi.mocked(mockedPrisma.customer.findUnique).mockResolvedValue(null);

      await expect(
        customerLogin({ email: "bad@test.com", password: "wrong", tenantId: "tenant-1" })
      ).rejects.toThrow("Invalid credentials");
    });

    it("throws for inactive customer", async () => {
      vi.mocked(mockedPrisma.customer.findUnique).mockResolvedValue({
        ...mockCustomer,
        isActive: false,
      });

      await expect(
        customerLogin({ email: "customer@test.com", password: "Customer123!", tenantId: "tenant-1" })
      ).rejects.toThrow("Invalid credentials");
    });

    it("throws for wrong password", async () => {
      vi.mocked(mockedPrisma.customer.findUnique).mockResolvedValue({
        ...mockCustomer,
        password: hashSync("CorrectPass1!", 12),
      });

      await expect(
        customerLogin({ email: "customer@test.com", password: "WrongPass1!", tenantId: "tenant-1" })
      ).rejects.toThrow("Invalid credentials");
    });
  });

  describe("customerRegister", () => {
    it("creates customer and returns token", async () => {
      vi.mocked(mockedPrisma.customer.findUnique).mockResolvedValue(null);
      vi.mocked(mockedPrisma.customer.create).mockResolvedValue({
        id: "cust-1",
        email: "customer@test.com",
        firstName: "John",
        lastName: "Doe",
        tenantId: "tenant-1",
        isActive: true,
        password: "hashed",
        phone: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await customerRegister({
        tenantId: "tenant-1",
        email: "customer@test.com",
        password: "Customer123!",
        firstName: "John",
        lastName: "Doe",
      });

      expect(result.token).toBe("customer-token");
      expect(result.customer.email).toBe("customer@test.com");
    });

    it("throws for duplicate email", async () => {
      vi.mocked(mockedPrisma.customer.findUnique).mockResolvedValue({
        id: "existing",
        email: "existing@test.com",
      });

      await expect(
        customerRegister({
          tenantId: "tenant-1",
          email: "existing@test.com",
          password: "Customer123!",
          firstName: "John",
          lastName: "Doe",
        })
      ).rejects.toThrow("Email already registered");
    });
  });

  describe("changePassword", () => {
    it("updates password for admin user", async () => {
      const oldHash = hashSync("OldPass1!", 12);
      vi.mocked(mockedPrisma.adminUser.findUnique).mockResolvedValue({
        id: "admin-1",
        password: oldHash,
        email: "admin@test.com",
        firstName: "Admin",
        lastName: "User",
        role: "admin",
        tenantId: "tenant-1",
        isActive: true,
        branchId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      vi.mocked(mockedPrisma.adminUser.update).mockResolvedValue({
        id: "admin-1",
      });

      const result = await changePassword("admin-1", "admin", "OldPass1!", "NewPass2@");
      expect(result).toBe(true);
      expect(mockedPrisma.adminUser.update).toHaveBeenCalled();
    });

    it("throws for wrong old password", async () => {
      vi.mocked(mockedPrisma.adminUser.findUnique).mockResolvedValue({
        id: "admin-1",
        password: hashSync("CorrectPass1!", 12),
        email: "admin@test.com",
        firstName: "Admin",
        lastName: "User",
        role: "admin",
        tenantId: "tenant-1",
        isActive: true,
        branchId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(
        changePassword("admin-1", "admin", "WrongPass1!", "NewPass2@")
      ).rejects.toThrow("Invalid current password");
    });

    it("throws for short new password", async () => {
      await expect(
        changePassword("admin-1", "admin", "OldPass1!", "short")
      ).rejects.toThrow("Mínimo 8 caracteres");
    });

    it("updates password for customer user", async () => {
      const oldHash = hashSync("OldPass1!", 12);
      vi.mocked(mockedPrisma.customer.findUnique).mockResolvedValue({
        id: "cust-1",
        password: oldHash,
        email: "customer@test.com",
        firstName: "John",
        lastName: "Doe",
        tenantId: "tenant-1",
        isActive: true,
        phone: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      vi.mocked(mockedPrisma.customer.update).mockResolvedValue({
        id: "cust-1",
      });

      const result = await changePassword("cust-1", "customer", "OldPass1!", "NewPass2@");
      expect(result).toBe(true);
      expect(mockedPrisma.customer.update).toHaveBeenCalled();
    });
  });

  describe("findAdminById", () => {
    it("returns admin user", async () => {
      vi.mocked(mockedPrisma.adminUser.findUnique).mockResolvedValue({
        id: "admin-1",
        email: "admin@test.com",
        firstName: "Admin",
        lastName: "User",
        role: "admin",
        tenantId: "tenant-1",
        isActive: true,
        branchId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const result = await findAdminById("admin-1");
      expect(result?.email).toBe("admin@test.com");
    });
  });

  describe("findCustomerById", () => {
    it("returns customer", async () => {
      vi.mocked(mockedPrisma.customer.findUnique).mockResolvedValue({
        id: "cust-1",
        email: "cust@test.com",
        firstName: "John",
        lastName: "Doe",
        tenantId: "tenant-1",
        isActive: true,
        password: "hashed",
        phone: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const result = await findCustomerById("cust-1");
      expect(result?.email).toBe("cust@test.com");
    });
  });
});
