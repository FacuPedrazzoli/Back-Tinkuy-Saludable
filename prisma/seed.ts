import { PrismaClient, DiscountType, OrderStatus, PaymentStatus, LoyaltyPointType } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed...');

  // ───────────────────────────────────────────
  // TENANT
  // ───────────────────────────────────────────
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'tinkuy' },
    update: {},
    create: {
      name: 'Tinkuy Saludable',
      slug: 'tinkuy',
      isActive: true,
    },
  });
  console.log('✅ Tenant created:', tenant.name);

  // ───────────────────────────────────────────
  // BRANCH
  // ───────────────────────────────────────────
  const branch = await prisma.branch.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      tenantId: tenant.id,
      name: 'Tienda Principal',
      address: 'Av. Corrientes 1234, CABA',
      phone: '+54 11 5555-1234',
      isActive: true,
    },
  });
  console.log('✅ Branch created:', branch.name);

  // ───────────────────────────────────────────
  // CATEGORIES (8 categories)
  // ───────────────────────────────────────────
  const categoriesData = [
    { name: 'Proteínas y Suplementos', slug: 'proteinas-y-suplementos', description: 'Proteínas de suero, caseína, soja y más para complementar tu alimentación', imageUrl: 'https://images.unsplash.com/photo-1593095948071-474c5cc2989d?w=400' },
    { name: 'Vitaminas y Minerales', slug: 'vitaminas-y-minerales', description: 'Vitaminas, minerales y complementos para tu bienestar diario', imageUrl: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400' },
    { name: 'Productos Naturales', slug: 'productos-naturales', description: 'Alimentos naturales, orgánicos y sin conservantes', imageUrl: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=400' },
    { name: 'Snacks Saludables', slug: 'snacks-saludables', description: 'Snacks nutritivos, barras de cereal, frutos secos y más', imageUrl: 'https://images.unsplash.com/photo-1621939514649-280e2ee25f60?w=400' },
    { name: 'Bebidas Saludables', slug: 'bebidas-saludables', description: 'Jugos naturales, tés, aguas alkalinas y bebidas funcionales', imageUrl: 'https://images.unsplash.com/photo-1544145945-f90425340c7e?w=400' },
    { name: 'Sin TACC', slug: 'sin-tacc', description: 'Productos certificados sin gluten para celíacos', imageUrl: 'https://images.unsplash.com/photo-1550507992-eb63ffee0847?w=400' },
    { name: 'Vegano', slug: 'vegano', description: 'Productos 100% vegetales y cruelty-free', imageUrl: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400' },
    { name: 'Hierbas y Aromáticas', slug: 'hierbas-y-aromaticas', description: 'Hierbas medicinales, especias y tés naturales', imageUrl: 'https://images.unsplash.com/photo-1564890369478-c89ca6d9cde9?w=400' },
  ];

  const categories: Record<string, { id: string; name: string }> = {};
  for (const cat of categoriesData) {
    const category = await prisma.category.upsert({
      where: { tenantId_slug: { tenantId: tenant.id, slug: cat.slug } },
      update: {},
      create: {
        tenantId: tenant.id,
        name: cat.name,
        slug: cat.slug,
        description: cat.description,
        imageUrl: cat.imageUrl,
        isActive: true,
        sortOrder: categoriesData.indexOf(cat),
      },
    });
    categories[cat.slug] = category;
  }
  console.log('✅ Categories created:', Object.keys(categories).length);

  // ───────────────────────────────────────────
  // ADMIN USER
  // ───────────────────────────────────────────
  const adminPassword = await bcrypt.hash('Admin123!', 12);
  const admin = await prisma.adminUser.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'admin@tinkuy.com' } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'admin@tinkuy.com',
      password: adminPassword,
      firstName: 'Administrador',
      lastName: 'Tinkuy',
      role: 'admin',
      isActive: true,
    },
  });
  console.log('✅ Admin created:', admin.email);

  // ───────────────────────────────────────────
  // CUSTOMERS (2 additional + 1 vendor)
  // ───────────────────────────────────────────
  const customerPassword = await bcrypt.hash('Cliente123!', 12);
  const customer1 = await prisma.customer.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'cliente@tinkuy.com' } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'cliente@tinkuy.com',
      password: customerPassword,
      firstName: 'Juan',
      lastName: 'Pérez',
      phone: '+54 11 5555-0001',
      birthDate: new Date('1990-05-15'),
      loyaltyPoints: 500,
      isActive: true,
    },
  });

  const customer2Password = await bcrypt.hash('Cliente2123!', 12);
  const customer2 = await prisma.customer.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'maria@lopez.com' } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'maria@lopez.com',
      password: customer2Password,
      firstName: 'María',
      lastName: 'López',
      phone: '+54 11 5555-0002',
      birthDate: new Date('1985-08-22'),
      loyaltyPoints: 1250,
      isActive: true,
    },
  });

  const vendorPassword = await bcrypt.hash('Vendedor123!', 12);
  const vendor = await prisma.adminUser.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'vendedor@tinkuy.com' } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'vendedor@tinkuy.com',
      password: vendorPassword,
      firstName: 'Carlos',
      lastName: 'Venta',
      role: 'manager',
      isActive: true,
    },
  });
  console.log('✅ Customers created');

  // ───────────────────────────────────────────
  // PRODUCTS (40+ products)
  // ───────────────────────────────────────────
  const productsData = [
    // Proteínas y Suplementos
    { name: 'Proteína de Suero de Leche x 1kg', slug: 'proteina-suero-1kg', description: 'Proteína de alta calidad con 24g de proteína por servicio. Ideal para recuperación muscular post-entrenamiento.', sku: 'PROT-001', basePrice: 8500, category: 'proteinas-y-suplementos', attributes: [{ key: 'protein', value: '24g' }, { key: 'vegan', value: 'false' }], images: ['https://images.unsplash.com/photo-1593095948071-474c5cc2989d?w=400'] },
    { name: 'Proteína de Caseína x 1kg', slug: 'proteina-caseina-1kg', description: 'Proteína de liberación lenta, perfecta para tomar antes de dormir. 22g de proteína por servicio.', sku: 'PROT-002', basePrice: 9200, category: 'proteinas-y-suplementos', attributes: [{ key: 'protein', value: '22g' }, { key: 'vegan', value: 'false' }], images: ['https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400'] },
    { name: 'Proteína de Soja Isolate x 750g', slug: 'proteina-soja-750g', description: 'Proteína vegetal de alta digestibilidad. Sin gluten y sin lactosa. 25g de proteína por servicio.', sku: 'PROT-003', basePrice: 7800, category: 'proteinas-y-suplementos', attributes: [{ key: 'protein', value: '25g' }, { key: 'vegan', value: 'true' }, { key: 'glutenFree', value: 'true' }], images: ['https://images.unsplash.com/photo-1550507992-eb63ffee0847?w=400'] },
    { name: 'BCAA x 300g', slug: 'bcaa-300g', description: 'Aminoácidos ramificados para optimizar recuperación y reducir fatiga muscular.', sku: 'PROT-004', basePrice: 5500, category: 'proteinas-y-suplementos', attributes: [{ key: 'servings', value: '30' }], images: ['https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400'] },
    { name: 'Creatina Monohidratada x 500g', slug: 'creatina-500g', description: 'Creatina de grado farmacéutico. Mejora rendimiento y fuerza en ejercicios de alta intensidad.', sku: 'PROT-005', basePrice: 4800, category: 'proteinas-y-suplementos', attributes: [{ key: 'purity', value: '99%' }], images: ['https://images.unsplash.com/photo-1593095948071-474c5cc2989d?w=400'] },
    { name: 'Glutamina x 300g', slug: 'glutamina-300g', description: 'Aminoácido condicionalmente esencial. Support recovery and immune system.', sku: 'PROT-006', basePrice: 4200, category: 'proteinas-y-suplementos', attributes: [], images: ['https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400'] },
    { name: 'Mass Gainer x 3kg', slug: 'mass-gainer-3kg', description: 'Preparado hipercalórico para ganar masa muscular. 1200 kcal por servicio.', sku: 'PROT-007', basePrice: 12500, category: 'proteinas-y-suplementos', attributes: [{ key: 'calories', value: '1200' }], images: ['https://images.unsplash.com/photo-1593095948071-474c5cc2989d?w=400'] },
    { name: 'Pre-Workout x 300g', slug: 'pre-workout-300g', description: 'Pre-entreno con cafeína, beta-alanina y citrulina. Aumenta energía y focus.', sku: 'PROT-008', basePrice: 6500, category: 'proteinas-y-suplementos', attributes: [{ key: 'caffeine', value: '200mg' }], images: ['https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400'] },

    // Vitaminas y Minerales
    { name: 'Vitamina D3 5000 UI x 120 cápsulas', slug: 'vitamina-d3-5000', description: 'Vitamina D3 de alta biodisponibilidad. Esencial para huesos, dientes y sistema inmune.', sku: 'VIT-001', basePrice: 3500, category: 'vitaminas-y-minerales', attributes: [{ key: 'vegan', value: 'false' }], images: ['https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400'] },
    { name: 'Vitamina C 1000mg x 90 comprimidos', slug: 'vitamina-c-1000', description: 'Antioxidante de alta dosis. Refuerza el sistema inmunológico y formación de colágeno.', sku: 'VIT-002', basePrice: 2800, category: 'vitaminas-y-minerales', attributes: [], images: ['https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400'] },
    { name: 'Magnesio Quelado x 90 cápsulas', slug: 'magnesio-quelado-90', description: 'Magnesio de alta absorción. Reduce fatiga, calambres y mejora función muscular.', sku: 'VIT-003', basePrice: 4200, category: 'vitaminas-y-minerales', attributes: [{ key: 'bioavailability', value: 'high' }], images: ['https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400'] },
    { name: 'Zinc Picolinato x 60 cápsulas', slug: 'zinc-picolinato-60', description: 'Zinc de alta biodisponibilidad. Essential for immune function and skin health.', sku: 'VIT-004', basePrice: 3200, category: 'vitaminas-y-minerales', attributes: [], images: ['https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400'] },
    { name: 'Vitamina B12 1000mcg x 90 comprimidos', slug: 'vitamina-b12-1000', description: 'Vitamina B12 metilcobalamina. Fundamental para sistema nervioso y formación de glóbulos rojos.', sku: 'VIT-005', basePrice: 3100, category: 'vitaminas-y-minerales', attributes: [{ key: 'form', value: 'methylcobalamin' }], images: ['https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400'] },
    { name: 'Omega 3 1000mg x 90 cápsulas', slug: 'omega-3-1000', description: 'Aceite de pescado rico en EPA y DHA. Salud cardiovascular y cerebral.', sku: 'VIT-006', basePrice: 4800, category: 'vitaminas-y-minerales', attributes: [{ key: 'epa', value: '300mg' }, { key: 'dha', value: '200mg' }], images: ['https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400'] },
    { name: 'Calcio + Vitamina D x 120 comprimidos', slug: 'calcio-vitamina-d-120', description: 'Complemento para salud ósea. Calcio + D3 para mejor absorción.', sku: 'VIT-007', basePrice: 3900, category: 'vitaminas-y-minerales', attributes: [{ key: 'calcium', value: '600mg' }], images: ['https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400'] },
    { name: 'Complejo B x 90 cápsulas', slug: 'complejo-b-90', description: ' комплекс витаминов группы B для энергии и нервной системы.', sku: 'VIT-008', basePrice: 3600, category: 'vitaminas-y-minerales', attributes: [], images: ['https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400'] },

    // Productos Naturales
    { name: 'Miel de Abeja Pura x 500g', slug: 'miel-pura-500g', description: 'Miel 100% pura, sin agregados. Origen Argentina, zona cordillerana.', sku: 'NAT-001', basePrice: 2800, category: 'productos-naturales', attributes: [{ key: 'organic', value: 'true' }], images: ['https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=400'] },
    { name: 'Polen de Abeja x 250g', slug: 'polen-abeja-250g', description: 'Polen fresco liofilizado. Rico en proteínas, vitaminas y minerales.', sku: 'NAT-002', basePrice: 3500, category: 'productos-naturales', attributes: [{ key: 'organic', value: 'true' }], images: ['https://images.unsplash.com/photo-1550507992-eb63ffee0847?w=400'] },
    { name: 'Jalea Real x 30ml', slug: 'jalea-real-30ml', description: 'Jalea real fresca, antioxidante natural. Ideal para reforzar defensas.', sku: 'NAT-003', basePrice: 4200, category: 'productos-naturales', attributes: [], images: ['https://images.unsplash.com/photo-1550507992-eb63ffee0847?w=400'] },
    { name: 'Propóleo x 30ml', slug: 'pro poleo-30ml', description: 'Extracto de propóleo para fortalecer el sistema inmunológico.', sku: 'NAT-004', basePrice: 2800, category: 'productos-naturales', attributes: [], images: ['https://images.unsplash.com/photo-1550507992-eb63ffee0847?w=400'] },
    { name: 'Semillas de Chía x 500g', slug: 'semillas-chia-500g', description: 'Semillas de chía orgánicas. Ricas en omega-3 y fibra.', sku: 'NAT-005', basePrice: 2200, category: 'productos-naturales', attributes: [{ key: 'organic', value: 'true' }, { key: 'glutenFree', value: 'true' }], images: ['https://images.unsplash.com/photo-1540420773420-3366772f4999?w=400'] },
    { name: 'Semillas de Lino Doradas x 500g', slug: 'semillas-lino-500g', description: 'Semillas de lino doradas. Fuente de omega-3 y lignanos.', sku: 'NAT-006', basePrice: 1900, category: 'productos-naturales', attributes: [{ key: 'organic', value: 'true' }], images: ['https://images.unsplash.com/photo-1540420773420-3366772f4999?w=400'] },
    { name: 'Cacao Puro x 250g', slug: 'cacao-puro-250g', description: 'Cacao en polvo sin azúcar. Rico en antioxidantes y magnesio.', sku: 'NAT-007', basePrice: 2400, category: 'productos-naturales', attributes: [{ key: 'organic', value: 'true' }, { key: 'vegan', value: 'true' }], images: ['https://images.unsplash.com/photo-1540420773420-3366772f4999?w=400'] },
    { name: 'Stevia Líquida x 100ml', slug: 'stevia-liquida-100ml', description: 'Edulcorante natural de stevia. Sin calorías, 100% natural.', sku: 'NAT-008', basePrice: 1500, category: 'productos-naturales', attributes: [{ key: 'calories', value: '0' }, { key: 'vegan', value: 'true' }], images: ['https://images.unsplash.com/photo-1550507992-eb63ffee0847?w=400'] },

    // Snacks Saludables
    { name: 'Barra de Cereal Proteica x 12 unidades', slug: 'barra-cereal-proteica-12', description: 'Barras con 20g de proteína. Snack ideal para después del entrenamiento.', sku: 'SNK-001', basePrice: 4500, category: 'snacks-saludables', attributes: [{ key: 'protein', value: '20g' }], images: ['https://images.unsplash.com/photo-1621939514649-280e2ee25f60?w=400'] },
    { name: 'Mix de Frutos Secos x 400g', slug: 'mix-frutos-secos-400g', description: 'Mezcla de almendras, nueces, pecanas y castañas. Sin agregados.', sku: 'SNK-002', basePrice: 3800, category: 'snacks-saludables', attributes: [{ key: 'organic', value: 'true' }, { key: 'glutenFree', value: 'true' }], images: ['https://images.unsplash.com/photo-1621939514649-280e2ee25f60?w=400'] },
    { name: 'Almendras Laminadas x 300g', slug: 'almendras-laminadas-300g', description: 'Almendras laminadas tostadas. Perfectas para acompañar yogures o ensalada.', sku: 'SNK-003', basePrice: 3200, category: 'snacks-saludables', attributes: [{ key: 'organic', value: 'true' }], images: ['https://images.unsplash.com/photo-1621939514649-280e2ee25f60?w=400'] },
    { name: 'Pasas de Uva x 500g', slug: 'pasas-uva-500g', description: 'Pasas naturales sin azúcar añadida. Fuente de hierro y potasio.', sku: 'SNK-004', basePrice: 1800, category: 'snacks-saludables', attributes: [{ key: 'glutenFree', value: 'true' }], images: ['https://images.unsplash.com/photo-1621939514649-280e2ee25f60?w=400'] },
    { name: 'Galletas de Arroz Integral x 120g', slug: 'galletas-arroz-integral-120g', description: 'Galletas crujientes de arroz integral. Snack bajo en calorías.', sku: 'SNK-005', basePrice: 1400, category: 'snacks-saludables', attributes: [{ key: 'glutenFree', value: 'true' }, { key: 'vegan', value: 'true' }], images: ['https://images.unsplash.com/photo-1621939514649-280e2ee25f60?w=400'] },
    { name: 'Dátiles Rellenos con Pasta de Maní x 200g', slug: 'datiles-rellenos-200g', description: 'Dátiles Medjool rellenos de pasta de maní. Snack energético natural.', sku: 'SNK-006', basePrice: 2800, category: 'snacks-saludables', attributes: [{ key: 'organic', value: 'true' }, { key: 'vegan', value: 'true' }], images: ['https://images.unsplash.com/photo-1621939514649-280e2ee25f60?w=400'] },
    { name: 'Chocolate Negro 85% Cacao x 100g', slug: 'chocolate-negro-85-100g', description: 'Chocolate amargo 85% cacao. Rico en antioxidantes, bajo en azúcar.', sku: 'SNK-007', basePrice: 2200, category: 'snacks-saludables', attributes: [{ key: 'vegan', value: 'true' }, { key: 'glutenFree', value: 'true' }], images: ['https://images.unsplash.com/photo-1621939514649-280e2ee25f60?w=400'] },
    { name: 'Pepas de Membrillo x 250g', slug: 'pepas-membrillo-250g', description: 'Galletitas artesanales con dulce de membrillo. Sin conservantes.', sku: 'SNK-008', basePrice: 1600, category: 'snacks-saludables', attributes: [], images: ['https://images.unsplash.com/photo-1621939514649-280e2ee25f60?w=400'] },

    // Bebidas Saludables
    { name: 'Jugo Verde Detox x 1L', slug: 'jugo-verde-detox-1l', description: 'Jugo verde con espinaca, apio, pepino y manzana verde. 100% natural.', sku: 'BEV-001', basePrice: 3500, category: 'bebidas-saludables', attributes: [{ key: 'organic', value: 'true' }, { key: 'vegan', value: 'true' }], images: ['https://images.unsplash.com/photo-1544145945-f90425340c7e?w=400'] },
    { name: 'Té Matcha Ceremonial x 30g', slug: 'te-matcha-ceremonial-30g', description: 'Matcha japonés de primera flush. Para latte o consumo tradicional.', sku: 'BEV-002', basePrice: 5800, category: 'bebidas-saludables', attributes: [{ key: 'organic', value: 'true' }, { key: 'vegan', value: 'true' }], images: ['https://images.unsplash.com/photo-1544145945-f90425340c7e?w=400'] },
    { name: 'Té Kombucha x 500ml', slug: 'kombucha-500ml', description: 'Kombucha artesanal de té negro. Probióticos naturales para tu flora intestinal.', sku: 'BEV-003', basePrice: 2800, category: 'bebidas-saludables', attributes: [{ key: 'vegan', value: 'true' }, { key: 'glutenFree', value: 'true' }], images: ['https://images.unsplash.com/photo-1544145945-f90425340c7e?w=400'] },
    { name: 'Agua Alcalina x 1L', slug: 'agua-alcalina-1l', description: 'Agua mineralizada alcalina pH 8.5. Hidratación superior.', sku: 'BEV-004', basePrice: 1200, category: 'bebidas-saludables', attributes: [{ key: 'vegan', value: 'true' }, { key: 'glutenFree', value: 'true' }], images: ['https://images.unsplash.com/photo-1544145945-f90425340c7e?w=400'] },
    { name: 'Leche de Almendra x 1L', slug: 'leche-almendra-1l', description: 'Leche vegetal de almendras sin azúcar. Fuente de calcio y vitamina E.', sku: 'BEV-005', basePrice: 2400, category: 'bebidas-saludables', attributes: [{ key: 'vegan', value: 'true' }, { key: 'glutenFree', value: 'true' }, { key: 'keto', value: 'true' }], images: ['https://images.unsplash.com/photo-1544145945-f90425340c7e?w=400'] },
    { name: 'Leche de Coco x 1L', slug: 'leche-coco-1l', description: 'Leche de coco premium. Ideal para cocinar o beber.', sku: 'BEV-006', basePrice: 2200, category: 'bebidas-saludables', attributes: [{ key: 'vegan', value: 'true' }, { key: 'glutenFree', value: 'true' }], images: ['https://images.unsplash.com/photo-1544145945-f04d5c7e87c7e?w=400'] },
    { name: 'Smoothie Proteico x 250ml', slug: 'smoothie-proteico-250ml', description: 'Bebida proteica con frutas. 15g de proteína, lista para beber.', sku: 'BEV-007', basePrice: 1800, category: 'bebidas-saludables', attributes: [{ key: 'protein', value: '15g' }], images: ['https://images.unsplash.com/photo-1544145945-f90425340c7e?w=400'] },
    { name: 'Café Latte x 250ml', slug: 'cafe-latte-250ml', description: 'Café con leche, listo para calentar. Fuente natural de cafeína.', sku: 'BEV-008', basePrice: 1500, category: 'bebidas-saludables', attributes: [], images: ['https://images.unsplash.com/photo-1544145945-f90425340c7e?w=400'] },

    // Sin TACC
    { name: 'Mix de Harina Sin TACC x 1kg', slug: 'mix-harina-sin-tacc-1kg', description: 'Premezcla para pan y repostería sin gluten. Tested by ANMAT.', sku: 'GFT-001', basePrice: 2800, category: 'sin-tacc', attributes: [{ key: 'glutenFree', value: 'true' }, { key: 'vegan', value: 'false' }], images: ['https://images.unsplash.com/photo-1550507992-eb63ffee0847?w=400'] },
    { name: 'Fécula de Mandioca x 500g', slug: 'fecula-mandioca-500g', description: 'Fécula pura de mandioca. Almidón natural sin gluten.', sku: 'GFT-002', basePrice: 1400, category: 'sin-tacc', attributes: [{ key: 'glutenFree', value: 'true' }, { key: 'vegan', value: 'true' }], images: ['https://images.unsplash.com/photo-1550507992-eb63ffee0847?w=400'] },
    { name: 'Galletas Sin TACC Chocolate x 150g', slug: 'galletas-sin-tacc-choco-150g', description: 'Galletas de chocolate sin gluten. snack seguro para celíacos.', sku: 'GFT-003', basePrice: 1900, category: 'sin-tacc', attributes: [{ key: 'glutenFree', value: 'true' }], images: ['https://images.unsplash.com/photo-1550507992-eb63ffee0847?w=400'] },
    { name: 'Pan Rallado Sin TACC x 300g', slug: 'pan-rallado-sin-tacc-300g', description: 'Pan ralladoullo sin gluten. Para empanar y rebozar.', sku: 'GFT-004', basePrice: 1600, category: 'sin-tacc', attributes: [{ key: 'glutenFree', value: 'true' }], images: ['https://images.unsplash.com/photo-1550507992-eb63ffee0847?w=400'] },
    { name: 'Pasta Sin TACC x 500g', slug: 'pasta-sin-tacc-500g', description: 'Pastas elaboradas con harinas alternativas. Corn, rice and quinoa.', sku: 'GFT-005', basePrice: 2200, category: 'sin-tacc', attributes: [{ key: 'glutenFree', value: 'true' }], images: ['https://images.unsplash.com/photo-1550507992-eb63ffee0847?w=400'] },

    // Vegano
    { name: 'Proteína de Arveja x 750g', slug: 'proteina-arveja-750g', description: 'Proteína vegetal de arveja. 22g proteína por servicio. 100% vegano.', sku: 'VGN-001', basePrice: 6200, category: 'vegano', attributes: [{ key: 'protein', value: '22g' }, { key: 'vegan', value: 'true' }, { key: 'glutenFree', value: 'true' }], images: ['https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400'] },
    { name: 'Hamburguesa Vegetal x 4 unidades', slug: 'hamburguesa-vegetal-4', description: 'Hamburguesas 100% vegetales. Soja y trigo khorasan.', sku: 'VGN-002', basePrice: 2800, category: 'vegano', attributes: [{ key: 'vegan', value: 'true' }], images: ['https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400'] },
    { name: 'Queso Vegan Almendra x 200g', slug: 'queso-vegan-almendra-200g', description: 'Queso alternativo de almendras. Perfecto para fundir y gratinar.', sku: 'VGN-003', basePrice: 3500, category: 'vegano', attributes: [{ key: 'vegan', value: 'true' }, { key: 'glutenFree', value: 'true' }], images: ['https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400'] },
    { name: 'Leche de Soja Sin Azúcar x 1L', slug: 'leche-soja-sin-azucar-1l', description: 'Leche de soja natural sin azúcar agregada. Rica en proteína.', sku: 'VGN-004', basePrice: 1800, category: 'vegano', attributes: [{ key: 'vegan', value: 'true' }, { key: 'glutenFree', value: 'true' }], images: ['https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400'] },
    { name: 'Hummus Classic x 300g', slug: 'hummus-classic-300g', description: 'Pasta de garbanzos tradicional. Perfecto para dips y spreads.', sku: 'VGN-005', basePrice: 2400, category: 'vegano', attributes: [{ key: 'vegan', value: 'true' }, { key: 'glutenFree', value: 'true' }], images: ['https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400'] },

    // Hierbas y Aromáticas
    { name: 'Té Verde Japonés Sencha x 100g', slug: 'te-verde-sencha-100g', description: 'Té verde japonés de hoja entera. Rico en catequinas y antioxidantes.', sku: 'HERB-001', basePrice: 3200, category: 'hierbas-y-aromaticas', attributes: [{ key: 'organic', value: 'true' }, { key: 'vegan', value: 'true' }], images: ['https://images.unsplash.com/photo-1564890369478-c89ca6d9cde9?w=400'] },
    { name: 'Manzanilla Alemana x 80g', slug: 'manzanilla-alemana-80g', description: 'Manzanilla premium para infusiones. Calma y relaja.', sku: 'HERB-002', basePrice: 1800, category: 'hierbas-y-aromaticas', attributes: [{ key: 'organic', value: 'true' }, { key: 'vegan', value: 'true' }], images: ['https://images.unsplash.com/photo-1564890369478-c89ca6d9cde9?w=400'] },
    { name: 'Menta Piperita x 80g', slug: 'menta-piperita-80g', description: 'Menta fresca para infusiones. Ayuda a la digestión.', sku: 'HERB-003', basePrice: 1600, category: 'hierbas-y-aromaticas', attributes: [{ key: 'organic', value: 'true' }, { key: 'vegan', value: 'true' }], images: ['https://images.unsplash.com/photo-1564890369478-c89ca6d9cde9?w=400'] },
    { name: 'Valeriana Raíz x 60g', slug: 'valeriana-raiz-60g', description: 'Valeriana oficinal para dormir mejor. Raíz deshidratada.', sku: 'HERB-004', basePrice: 2200, category: 'hierbas-y-aromaticas', attributes: [{ key: 'organic', value: 'true' }], images: ['https://images.unsplash.com/photo-1564890369478-c89ca6d9cde9?w=400'] },
    { name: 'Jenjibre Raíz x 100g', slug: 'jenjibre-raiz-100g', description: 'Jenjibre molido para infusiones. Antiinflamatorio natural.', sku: 'HERB-005', basePrice: 1900, category: 'hierbas-y-aromaticas', attributes: [{ key: 'organic', value: 'true' }, { key: 'vegan', value: 'true' }], images: ['https://images.unsplash.com/photo-1564890369478-c89ca6d9cde9?w=400'] },
    { name: 'Orégano Seco x 50g', slug: 'oregano-seco-50g', description: 'Orégano deshidratado de alta calidad. Aromático y sabroso.', sku: 'HERB-006', basePrice: 1200, category: 'hierbas-y-aromaticas', attributes: [{ key: 'organic', value: 'true' }, { key: 'vegan', value: 'true' }], images: ['https://images.unsplash.com/photo-1564890369478-c89ca6d9cde9?w=400'] },
    { name: 'Mix Mediterrâneo x 80g', slug: 'mix-mediterraneo-80g', description: 'Mezcla de hierbas mediterráneas. Romero, tomillo,orégano y albahaca.', sku: 'HERB-007', basePrice: 2400, category: 'hierbas-y-aromaticas', attributes: [{ key: 'organic', value: 'true' }, { key: 'vegan', value: 'true' }], images: ['https://images.unsplash.com/photo-1564890369478-c89ca6d9cde9?w=400'] },
    { name: 'Lavanda Flores x 40g', slug: 'lavanda-flores-40g', description: 'Flores de lavanda secas. Para tés, aromaterapia y decoración.', sku: 'HERB-008', basePrice: 2000, category: 'hierbas-y-aromaticas', attributes: [{ key: 'organic', value: 'true' }], images: ['https://images.unsplash.com/photo-1564890369478-c89ca6d9cde9?w=400'] },
  ];

  const createdProducts: { id: string; name: string }[] = [];
  for (const prod of productsData) {
    const product = await prisma.product.upsert({
      where: { tenantId_slug: { tenantId: tenant.id, slug: prod.slug } },
      update: {},
      create: {
        tenantId: tenant.id,
        categoryId: categories[prod.category]?.id,
        name: prod.name,
        slug: prod.slug,
        description: prod.description,
        sku: prod.sku,
        basePrice: prod.basePrice,
        isActive: true,
        isVisible: true,
        isFeatured: productsData.indexOf(prod) < 8,
        stock: Math.floor(Math.random() * 100) + 10,
        trackInventory: true,
      },
    });
    createdProducts.push(product);

    for (let i = 0; i < prod.images.length; i++) {
      await prisma.productImage.upsert({
        where: { id: `${product.id}-img-${i}` },
        update: {},
        create: {
          id: `${product.id}-img-${i}`,
          productId: product.id,
          url: prod.images[i],
          altText: prod.name,
          position: i,
        },
      });
    }

    for (const attr of prod.attributes) {
      await prisma.productAttribute.upsert({
        where: { id: `${product.id}-attr-${attr.key}` },
        update: {},
        create: {
          id: `${product.id}-attr-${attr.key}`,
          productId: product.id,
          key: attr.key,
          value: attr.value,
        },
      });
    }
  }
  console.log('✅ Products created:', createdProducts.length);

  // ───────────────────────────────────────────
  // COUPONS
  // ───────────────────────────────────────────
  const couponsData = [
    {
      code: 'BIENVENIDO10',
      description: '10% de descuento en tu primera compra',
      discountType: DiscountType.PERCENTAGE,
      discountValue: 10,
      maxDiscount: 2000,
      maxUses: 1000,
      perUserLimit: 1,
      daysValid: 30,
    },
    {
      code: 'SAVE20',
      description: '20% de descuento en cualquier producto',
      discountType: DiscountType.PERCENTAGE,
      discountValue: 20,
      maxDiscount: 5000,
      maxUses: 500,
      perUserLimit: 3,
      daysValid: 15,
    },
    {
      code: 'FREE5',
      description: 'Envío gratis en compras mayores a $5000',
      discountType: DiscountType.FIXED,
      discountValue: 0,
      minPurchase: 5000,
      maxUses: 200,
      perUserLimit: 2,
      daysValid: 7,
    },
  ];

  const createdCoupons: { id: string; code: string }[] = [];
  for (const coup of couponsData) {
    const coupon = await prisma.coupon.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: coup.code } },
      update: {},
      create: {
        tenantId: tenant.id,
        code: coup.code,
        description: coup.description,
        discountType: coup.discountType,
        discountValue: coup.discountValue,
        minPurchase: coup.minPurchase || null,
        maxDiscount: coup.maxDiscount || null,
        maxUses: coup.maxUses,
        perUserLimit: coup.perUserLimit,
        startsAt: new Date(),
        expiresAt: new Date(Date.now() + coup.daysValid * 24 * 60 * 60 * 1000),
        isActive: true,
      },
    });
    createdCoupons.push(coupon);
  }
  console.log('✅ Coupons created:', createdCoupons.length);

  // ───────────────────────────────────────────
  // SHIPPING RATES
  // ───────────────────────────────────────────
  const shippingRatesData = [
    { name: 'Capital Federal', minWeight: 0, maxWeight: 5, price: 800, freeFrom: 8000 },
    { name: 'Capital Federal', minWeight: 5, maxWeight: 10, price: 1200, freeFrom: 12000 },
    { name: 'GBA Norte', minWeight: 0, maxWeight: 5, price: 1200, freeFrom: 10000 },
    { name: 'GBA Sur', minWeight: 0, maxWeight: 5, price: 1200, freeFrom: 10000 },
    { name: 'GBA Oeste', minWeight: 0, maxWeight: 5, price: 1200, freeFrom: 10000 },
    { name: 'Interior Buenos Aires', minWeight: 0, maxWeight: 5, price: 1800, freeFrom: 15000 },
    { name: 'Resto del País', minWeight: 0, maxWeight: 2, price: 2500, freeFrom: 20000 },
  ];

  for (const rate of shippingRatesData) {
    await prisma.shippingRate.upsert({
      where: { id: `shipping-${rate.name.toLowerCase().replace(/ /g, '-')}-${rate.minWeight}` },
      update: {},
      create: {
        id: `shipping-${rate.name.toLowerCase().replace(/ /g, '-')}-${rate.minWeight}`,
        tenantId: tenant.id,
        name: rate.name,
        minWeight: rate.minWeight,
        maxWeight: rate.maxWeight,
        price: rate.price,
        freeFrom: rate.freeFrom,
        isActive: true,
      },
    });
  }
  console.log('✅ Shipping rates created');

  // ───────────────────────────────────────────
  // ORDERS (5 orders in different statuses)
  // ───────────────────────────────────────────
  const ordersData = [
    {
      customer: customer1,
      status: OrderStatus.delivered,
      paymentStatus: PaymentStatus.approved,
      items: [
        { productIdx: 0, quantity: 2, price: 8500 },
        { productIdx: 8, quantity: 1, price: 3500 },
      ],
      shippingCost: 800,
      notes: 'Entregar en horario de la mañana',
    },
    {
      customer: customer2,
      status: OrderStatus.shipped,
      paymentStatus: PaymentStatus.approved,
      items: [
        { productIdx: 2, quantity: 1, price: 7800 },
        { productIdx: 10, quantity: 2, price: 4200 },
      ],
      shippingCost: 1200,
      trackingNumber: 'AR123456789',
      shippingMethod: 'CORREO',
    },
    {
      customer: customer1,
      status: OrderStatus.paid,
      paymentStatus: PaymentStatus.approved,
      items: [
        { productIdx: 16, quantity: 3, price: 2800 },
        { productIdx: 24, quantity: 1, price: 4500 },
      ],
      shippingCost: 0,
      couponCode: 'FREE5',
    },
    {
      customer: customer2,
      status: OrderStatus.pending,
      paymentStatus: PaymentStatus.pending,
      items: [
        { productIdx: 32, quantity: 1, price: 6200 },
        { productIdx: 40, quantity: 2, price: 5800 },
      ],
      shippingCost: 2500,
    },
    {
      customer: customer1,
      status: OrderStatus.cancelled,
      paymentStatus: PaymentStatus.rejected,
      items: [
        { productIdx: 4, quantity: 1, price: 4800 },
      ],
      shippingCost: 800,
      notes: 'Cliente canceló',
    },
  ];

  for (let i = 0; i < ordersData.length; i++) {
    const orderData = ordersData[i];
    const subtotal = orderData.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const totalAmount = subtotal + (orderData.shippingCost || 0);

    const order = await prisma.order.create({
      data: {
        tenantId: tenant.id,
        branchId: branch.id,
        customerId: orderData.customer.id,
        status: orderData.status,
        paymentStatus: orderData.paymentStatus,
        subtotal: subtotal,
        totalAmount: totalAmount,
        shippingCost: orderData.shippingCost || 0,
        trackingNumber: orderData.trackingNumber || null,
        shippingMethod: orderData.shippingMethod || null,
        notes: orderData.notes || null,
        couponCode: orderData.couponCode || null,
      },
    });

    for (const item of orderData.items) {
      const product = createdProducts[item.productIdx];
      await prisma.orderItem.create({
        data: {
          orderId: order.id,
          productId: product.id,
          name: product.name,
          price: item.price,
          quantity: item.quantity,
          total: item.price * item.quantity,
        },
      });
    }
  }
  console.log('✅ Orders created:', ordersData.length);

  // ───────────────────────────────────────────
  // REVIEWS (sample reviews)
  // ───────────────────────────────────────────
  const reviewsData = [
    { productIdx: 0, customer: customer1, rating: 5, title: 'Excelente proteína', comment: 'Muy buen sabor y disolución. La recomiendo.', isApproved: true },
    { productIdx: 0, customer: customer2, rating: 4, title: 'Buena calidad', comment: 'Buena relación precio-calidad.', isApproved: true },
    { productIdx: 8, customer: customer1, rating: 5, title: 'Vitamina D3 efectiva', comment: 'Mejóré mis niveles de vitamina D.', isApproved: true },
    { productIdx: 16, customer: customer2, rating: 4, title: 'Buena miel', comment: 'Sabor auténtico, miel pura.', isApproved: true },
    { productIdx: 32, customer: customer1, rating: 5, title: 'Muy rica', comment: 'El sabor es excelente y es vegana.', isApproved: true },
  ];

  for (const review of reviewsData) {
    const product = createdProducts[review.productIdx];
    await prisma.review.upsert({
      where: { productId_customerId: { productId: product.id, customerId: review.customer.id } },
      update: {},
      create: {
        productId: product.id,
        customerId: review.customer.id,
        rating: review.rating,
        title: review.title,
        comment: review.comment,
        isApproved: review.isApproved,
        approvedAt: review.isApproved ? new Date() : null,
        approvedBy: review.isApproved ? admin.id : null,
      },
    });
  }
  console.log('✅ Reviews created:', reviewsData.length);

  // ───────────────────────────────────────────
  // LOYALTY POINTS
  // ───────────────────────────────────────────
  const loyaltyPointsData = [
    { customer: customer1, points: 500, type: LoyaltyPointType.EARN, description: 'Puntos de bienvenida', orderId: null },
    { customer: customer1, points: 170, type: LoyaltyPointType.EARN, description: 'Puntos por compra #1', orderId: null },
    { customer: customer2, points: 1250, type: LoyaltyPointType.EARN, description: 'Puntos acumulados', orderId: null },
    { customer: customer2, points: -200, type: LoyaltyPointType.REDEEM, description: 'Canje por descuento', orderId: null },
  ];

  for (const lp of loyaltyPointsData) {
    await prisma.loyaltyPoint.create({
      data: {
        customerId: lp.customer.id,
        orderId: lp.orderId,
        points: lp.points,
        type: lp.type,
        description: lp.description,
      },
    });
  }
  console.log('✅ Loyalty points created');

  // ───────────────────────────────────────────
  // NEWSLETTER SUBSCRIBERS
  // ───────────────────────────────────────────
  const subscribersData = [
    { email: 'suscriptor1@example.com', source: 'FOOTER' },
    { email: 'suscriptor2@example.com', source: 'POPUP' },
    { email: 'suscriptor3@example.com', source: 'CHECKOUT' },
  ];

  for (const sub of subscribersData) {
    await prisma.newsletterSubscriber.upsert({
      where: { email: sub.email },
      update: {},
      create: {
        email: sub.email,
        source: sub.source,
        isActive: true,
      },
    });
  }
  console.log('✅ Newsletter subscribers created');

  console.log('\n🎉 Seed completed successfully!');
  console.log('\nTest credentials:');
  console.log('  Admin:    admin@tinkuy.com / Admin123!');
  console.log('  Vendor:   vendedor@tinkuy.com / Vendedor123!');
  console.log('  Customer: cliente@tinkuy.com / Cliente123!');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
