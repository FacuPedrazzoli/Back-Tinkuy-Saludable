import { builder } from "@graphql/builder";
import * as authService from "./service";
import { rateLimitAuth } from "@lib/rate-limit";

// ─── Types ───

interface AuthUserShape {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  tenantId: string;
}

const AuthUser = builder.objectRef<AuthUserShape>("AuthUser").implement({
  fields: (t) => ({
    id: t.exposeID("id"),
    email: t.exposeString("email"),
    firstName: t.exposeString("firstName"),
    lastName: t.exposeString("lastName"),
    role: t.exposeString("role"),
    tenantId: t.exposeID("tenantId"),
  }),
});

interface CustomerAuthUserShape {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

const CustomerAuthUser = builder.objectRef<CustomerAuthUserShape>("CustomerAuthUser").implement({
  fields: (t) => ({
    id: t.exposeID("id"),
    email: t.exposeString("email"),
    firstName: t.exposeString("firstName"),
    lastName: t.exposeString("lastName"),
  }),
});

interface CustomerAuthResultShape {
  token: string;
  customer: CustomerAuthUserShape;
}

const CustomerAuthResult = builder.objectRef<CustomerAuthResultShape>("CustomerAuthResult").implement({
  fields: (t) => ({
    token: t.exposeString("token"),
    customer: t.field({
      type: CustomerAuthUser,
      resolve: (parent) => parent.customer,
    }),
  }),
});

interface AdminAuthResultShape {
  token: string;
  user: AuthUserShape;
}

const AdminAuthResult = builder.objectRef<AdminAuthResultShape>("AdminAuthResult").implement({
  fields: (t) => ({
    token: t.exposeString("token"),
    user: t.field({
      type: AuthUser,
      resolve: (parent) => parent.user,
    }),
  }),
});

// ─── Inputs ───

const AdminLoginInput = builder.inputType("AdminLoginInput", {
  fields: (t) => ({
    email: t.string({ required: true }),
    password: t.string({ required: true }),
    tenantId: t.string({ required: true }),
  }),
});

const CustomerLoginInput = builder.inputType("CustomerLoginInput", {
  fields: (t) => ({
    email: t.string({ required: true }),
    password: t.string({ required: true }),
    tenantId: t.string({ required: true }),
  }),
});

const CustomerRegisterInput = builder.inputType("CustomerRegisterInput", {
  fields: (t) => ({
    email: t.string({ required: true }),
    password: t.string({ required: true }),
    firstName: t.string({ required: true }),
    lastName: t.string({ required: true }),
    phone: t.string(),
    tenantId: t.string({ required: true }),
  }),
});

const ChangePasswordInput = builder.inputType("ChangePasswordInput", {
  fields: (t) => ({
    oldPassword: t.string({ required: true }),
    newPassword: t.string({ required: true }),
  }),
});

// ─── Queries ───

builder.queryField("me", (t) =>
  t.field({
    type: AuthUser,
    nullable: true,
    authScopes: { authenticated: true },
    resolve: async (_parent, _args, ctx) => {
      if (!ctx.user) return null;

      if (ctx.user.role === "customer") {
        const customer = await authService.findCustomerById(ctx.user.id);
        if (!customer) return null;
        return {
          id: customer.id,
          email: customer.email,
          firstName: customer.firstName,
          lastName: customer.lastName,
          role: "customer",
          tenantId: customer.tenantId,
        };
      }

      const admin = await authService.findAdminById(ctx.user.id);
      if (!admin) return null;
      return {
        id: admin.id,
        email: admin.email,
        firstName: admin.firstName,
        lastName: admin.lastName,
        role: admin.role,
        tenantId: admin.tenantId,
      };
    },
  })
);

// ─── Mutations ───

builder.mutationField("adminLogin", (t) =>
  t.field({
    type: AdminAuthResult,
    args: { input: t.arg({ type: AdminLoginInput, required: true }) },
    resolve: async (_parent, { input }) => {
      await rateLimitAuth(`admin:${input.email.toLowerCase().trim()}`);
      return authService.adminLogin(input);
    },
  })
);

builder.mutationField("customerLogin", (t) =>
  t.field({
    type: CustomerAuthResult,
    args: { input: t.arg({ type: CustomerLoginInput, required: true }) },
    resolve: async (_parent, { input }) => {
      await rateLimitAuth(`customer:${input.email.toLowerCase().trim()}`);
      return authService.customerLogin(input);
    },
  })
);

builder.mutationField("customerRegister", (t) =>
  t.field({
    type: CustomerAuthResult,
    args: { input: t.arg({ type: CustomerRegisterInput, required: true }) },
    resolve: async (_parent, { input }) => {
      await rateLimitAuth(`register:${input.email.toLowerCase().trim()}`);
      return authService.customerRegister(input);
    },
  })
);

builder.mutationField("changePassword", (t) =>
  t.field({
    type: "Boolean",
    authScopes: { authenticated: true },
    args: { input: t.arg({ type: ChangePasswordInput, required: true }) },
    resolve: async (_parent, { input }, ctx) => {
      if (!ctx.user) throw new Error("Unauthorized");
      return authService.changePassword(
        ctx.user.id,
        ctx.user.role,
        input.oldPassword,
        input.newPassword
      );
    },
  })
);
