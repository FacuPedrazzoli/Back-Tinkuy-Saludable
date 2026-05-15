import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function seed() {
  console.log("🌱 Seeding database...");

  const adminPassword = process.env.ADMIN_INITIAL_PASSWORD ?? crypto.randomUUID();
  console.log(`🔑 Admin initial password: ${adminPassword}`);

  // 1. Create Tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: "facusito-main" },
    update: {},
    create: {
      name: "Facusito",
      slug: "facusito-main",
      isActive: true,
    },
  });
  console.log(`✅ Tenant: ${tenant.name} (${tenant.id})`);

  // 2. Create Branch
  const branch = await prisma.branch.upsert({
    where: { id: "seed-branch-1" },
    update: {},
    create: {
      id: "seed-branch-1",
      tenantId: tenant.id,
      name: "Sucursal Central",
      address: "Av. Siempre Viva 123",
      phone: "+54 11 1234-5678",
      isActive: true,
    },
  });
  console.log(`✅ Branch: ${branch.name} (${branch.id})`);

  // 3. Create Admin User
  const hashedPassword = await bcrypt.hash(adminPassword, 12);
  const admin = await prisma.adminUser.upsert({
    where: {
      tenantId_email: { tenantId: tenant.id, email: "admin@facusito.com" },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      branchId: branch.id,
      email: "admin@facusito.com",
      password: hashedPassword,
      firstName: "Admin",
      lastName: "Principal",
      role: "admin",
      isActive: true,
    },
  });
  console.log(`✅ Admin: ${admin.email} (${admin.id})`);

  // 4. Create Tags
  const tagNames = ["Proteínas", "Snacks Saludables", "Suplementos", "Orgánicos"];
  const tags = await Promise.all(
    tagNames.map((name) =>
      prisma.tag.upsert({
        where: {
          slug: name.toLowerCase().replace(/\s+/g, "-"),
        },
        update: {},
        create: {
          tenantId: tenant.id,
          name,
          slug: name.toLowerCase().replace(/\s+/g, "-"),
        },
      })
    )
  );
  console.log(`✅ Tags: ${tags.map((t) => t.name).join(", ")}`);

  // 5. Create Products
  const productsData = [
    {
      name: "Proteína Whey 1kg",
      slug: "proteina-whey-1kg",
      description: "Proteína de suero de leche, sabor chocolate.",
      sku: "WHEY-001",
      basePrice: 25000,
    },
    {
      name: "Barrita de Cereal x12",
      slug: "barrita-cereal-x12",
      description: "Barritas de cereal sin azúcar añadida.",
      sku: "BAR-012",
      basePrice: 8500,
    },
    {
      name: "Creatina Monohidratada 300g",
      slug: "creatina-monohidratada-300g",
      description: "Creatina pura micronizada.",
      sku: "CREA-300",
      basePrice: 18000,
    },
  ];

  for (const p of productsData) {
    const product = await prisma.product.upsert({
      where: { tenantId_slug: { tenantId: tenant.id, slug: p.slug } },
      update: {},
      create: {
        tenantId: tenant.id,
        name: p.name,
        slug: p.slug,
        description: p.description,
        sku: p.sku,
        basePrice: p.basePrice,
        isActive: true,
        isVisible: true,
      },
    });

    // Create a default variant for each product
    await prisma.productVariant.upsert({
      where: { productId_sku: { productId: product.id, sku: p.sku } },
      update: {},
      create: {
        productId: product.id,
        sku: p.sku,
        name: p.name,
        price: p.basePrice,
        isActive: true,
      },
    });

    // Add initial stock
    await prisma.stockMovement.create({
      data: {
        tenantId: tenant.id,
        branchId: branch.id,
        productId: product.id,
        type: "INBOUND",
        quantity: 100,
        reason: "Initial stock (seed)",
      },
    });

    console.log(`✅ Product: ${product.name} (${product.id})`);
  }

  console.log("🎉 Seed completed successfully!");
}

seed()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
