import SchemaBuilder from "@pothos/core";
import PrismaPlugin from "@pothos/plugin-prisma";
import ScopeAuthPlugin from "@pothos/plugin-scope-auth";
import ValidationPlugin from "@pothos/plugin-validation";
import type { Context } from "./context";
import { prisma } from "@lib/prisma";
import type PrismaTypes from "@pothos/plugin-prisma/generated";
import { DateTimeResolver, JSONObjectResolver } from "graphql-scalars";
import Decimal from "decimal.js";

export const builder = new SchemaBuilder<{
  PrismaTypes: PrismaTypes;
  Context: Context;
  Scalars: {
    DateTime: {
      Input: Date;
      Output: Date;
    };
    JSON: {
      Input: unknown;
      Output: unknown;
    };
    Decimal: {
      Input: string;
      Output: string;
    };
  };
  AuthScopes: {
    public: boolean;
    admin: boolean;
    manager: boolean;
    customer: boolean;
    authenticated: boolean;
  };
}>({
  plugins: [PrismaPlugin, ScopeAuthPlugin, ValidationPlugin],
  prisma: {
    client: prisma,
    filterConnectionTotalCount: true,
  },
  authScopes: async (context) => ({
    public: false,
    authenticated: !!context.user,
    admin: context.user?.role === "admin",
    manager: context.user?.role === "admin" || context.user?.role === "manager",
    customer: context.user?.role === "customer",
  }),
});

// Register scalars
builder.addScalarType("DateTime", DateTimeResolver, {});
builder.addScalarType("JSON", JSONObjectResolver, {});
builder.scalarType("Decimal", {
  serialize: (value) => new Decimal(value).toString(),
  parseValue: (value) => new Decimal(value as string).toString(),
});

// Expose Node interface for relay-style IDs
builder.queryType({
  authScopes: { public: true },
});

builder.mutationType({
  authScopes: { public: true },
});
