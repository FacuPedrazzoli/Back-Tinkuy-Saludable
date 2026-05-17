import { prisma } from "@lib/prisma";

/**
 * Resolve a usable Tenant id from a caller-supplied value that may be a
 * tenant id, a tenant slug, missing, or stale.
 *
 * Resolution order:
 *   1. exact match by id
 *   2. match by slug
 *   3. single-tenant fallback: if exactly one active tenant exists, use it
 *
 * The single-tenant fallback makes this deployment resilient to a
 * misconfigured / build-stale NEXT_PUBLIC_TENANT_ID on the frontend without
 * weakening isolation: it only triggers when there is no ambiguity (exactly
 * one active tenant). Throws a clear error when it cannot resolve.
 *
 * Note: the `Tenant` model is intentionally excluded from the multi-tenant
 * Prisma middleware, so these queries are not auto-filtered.
 */
export async function resolveTenantId(
  provided?: string | null,
): Promise<string> {
  const value = provided?.trim();

  if (value) {
    const byId = await prisma.tenant.findUnique({
      where: { id: value },
      select: { id: true },
    });
    if (byId) return byId.id;

    const bySlug = await prisma.tenant.findUnique({
      where: { slug: value },
      select: { id: true },
    });
    if (bySlug) return bySlug.id;
  }

  const active = await prisma.tenant.findMany({
    where: { isActive: true },
    select: { id: true },
    take: 2,
  });
  if (active.length === 1) return active[0].id;

  throw new Error(
    value
      ? `Tenant "${value}" not found and no single-tenant fallback available`
      : "Tenant not specified and no single-tenant fallback available",
  );
}
