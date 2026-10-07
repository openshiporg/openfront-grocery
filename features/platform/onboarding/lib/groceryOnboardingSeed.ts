import { z } from 'zod';

const nonEmpty = z.string().trim().min(1);
const money = z.number().finite().nonnegative();
const wholeNumber = z.number().int().nonnegative();

const fulfillmentWindowSchema = z.object({
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  isActive: z.boolean(),
});

export const groceryOnboardingSeedSchema = z.object({
  storeSettings: z.object({
    name: nonEmpty,
    tagline: z.string(),
    homepageTitle: nonEmpty,
    homepageDescription: nonEmpty,
    contactEmail: z.string().email(),
    contactPhone: nonEmpty,
    address: nonEmpty,
    logoUrl: nonEmpty,
    brandHue: z.number().int().min(0).max(359),
    currencyCode: z.literal('USD'),
    taxRateBps: z.number().int().min(0).max(10_000),
    locale: nonEmpty,
    timezone: nonEmpty,
    countryCode: z.string().length(2),
    hours: z.object({
      fulfillmentPolicy: z.object({
        horizonDays: z.number().int().min(1).max(31),
        cutoffMinutes: wholeNumber,
        blackoutDates: z.array(z.string()),
        deliveryWindows: z.array(fulfillmentWindowSchema.extend({
          capacity: z.number().int().positive(),
          deliveryFee: wholeNumber,
        })).min(1),
        pickupWindows: z.array(fulfillmentWindowSchema.extend({
          maxOrders: z.number().int().positive(),
        })).min(1),
      }),
    }).passthrough(),
    isActive: z.literal(true),
  }),
  departments: z.array(z.object({
    name: nonEmpty,
    handle: nonEmpty,
    description: z.string(),
    imageUrl: nonEmpty,
    sortOrder: wholeNumber,
    temperatureZone: z.enum(['ambient', 'refrigerated', 'frozen']),
    requiredLicenses: z.array(z.string()),
  })).min(1),
  suppliers: z.array(z.object({
    name: nonEmpty,
    contactName: nonEmpty,
    email: z.string().email(),
    phone: nonEmpty,
    paymentTerms: z.enum(['cod', 'net_15', 'net_30', 'net_60']),
    deliveryDays: z.array(z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])),
    minimumOrder: money,
  })).min(1),
  products: z.array(z.object({
    title: nonEmpty,
    handle: nonEmpty,
    sku: nonEmpty,
    status: z.enum(['draft', 'published', 'archived']),
    price: money,
    compareAtPrice: money,
    costPrice: money,
    inStock: z.boolean(),
    stockQuantity: wholeNumber,
    lowStockThreshold: wholeNumber,
    imageUrl: nonEmpty,
    thumbnailUrl: nonEmpty,
    departmentCode: z.enum(['produce', 'meat', 'seafood', 'dairy', 'bakery', 'deli', 'frozen', 'pantry', 'beverages', 'snacks', 'health_beauty', 'household']),
    departmentHandle: nonEmpty,
    supplierEmail: z.string().email(),
    isPerishable: z.boolean(),
    shelfLife: z.number().int().positive(),
    pricingMethod: z.enum(['unit', 'weight', 'volume']),
    unitOfMeasure: z.enum(['each', 'lb', 'oz', 'kg', 'g', 'L', 'mL', 'gallon', 'quart', 'pint']),
    organicCertified: z.boolean(),
    allergens: z.array(z.enum(['milk', 'eggs', 'fish', 'shellfish', 'tree_nuts', 'peanuts', 'wheat', 'soybeans', 'sesame'])),
  })).min(1),
  inventoryLots: z.array(z.object({
    lotNumber: nonEmpty,
    productHandle: nonEmpty,
    supplierEmail: z.string().email(),
    expirationOffsetDays: z.number().int().positive(),
    receivedOffsetDays: z.number().int(),
    quantity: wholeNumber,
    quantityRemaining: wholeNumber,
    costPerUnit: money,
    location: nonEmpty,
  })),
  deliverySlots: z.array(z.object({
    label: nonEmpty,
    dayOffset: z.number().int().min(0).max(31),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    capacity: z.number().int().positive(),
    currentBookings: wholeNumber,
    deliveryFee: wholeNumber,
    isActive: z.boolean(),
  })).min(1),
  pickupSlots: z.array(z.object({
    label: nonEmpty,
    dayOffset: z.number().int().min(0).max(31),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    maxOrders: z.number().int().positive(),
    currentOrders: wholeNumber,
    isAvailable: z.boolean(),
  })).min(1),
  parkingSpots: z.array(z.object({
    spotNumber: nonEmpty,
    description: z.string(),
    isAccessible: z.boolean(),
    isAvailable: z.boolean(),
  })),
  coupons: z.array(z.object({
    code: nonEmpty,
    discountType: z.enum(['percentage', 'fixed']),
    discountValue: money,
    minPurchase: money,
    maxUses: z.number().int().positive(),
    currentUses: wholeNumber,
    validFromOffsetDays: z.number().int(),
    validToOffsetDays: z.number().int().positive(),
    productCategories: z.array(z.string()),
    excludedProducts: z.array(z.string()),
    isActive: z.boolean(),
  })),
  paymentProviders: z.tuple([z.object({
    name: nonEmpty,
    code: z.literal('pp_stripe_default'),
    isInstalled: z.boolean(),
    metadata: z.object({
      provider: z.literal('stripe'),
      configuration: z.literal('server_environment'),
    }),
  })]),
}).strict().superRefine((seed, ctx) => {
  const unique = (values: string[], label: string) => {
    if (new Set(values).size !== values.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} must be unique` });
    }
  };

  unique(seed.departments.map((item) => item.handle), 'Department handles');
  unique(seed.suppliers.map((item) => item.email), 'Supplier emails');
  unique(seed.products.map((item) => item.handle), 'Product handles');
  unique(seed.products.map((item) => item.sku), 'Product SKUs');
  unique(seed.inventoryLots.map((item) => item.lotNumber), 'Inventory lot numbers');
  unique(seed.parkingSpots.map((item) => item.spotNumber), 'Parking spot numbers');
  unique(seed.coupons.map((item) => item.code), 'Coupon codes');

  const departments = new Set(seed.departments.map((item) => item.handle));
  const suppliers = new Set(seed.suppliers.map((item) => item.email));
  const products = new Set(seed.products.map((item) => item.handle));

  seed.products.forEach((product, index) => {
    if (!departments.has(product.departmentHandle)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['products', index, 'departmentHandle'], message: `Unknown department ${product.departmentHandle}` });
    }
    if (!suppliers.has(product.supplierEmail)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['products', index, 'supplierEmail'], message: `Unknown supplier ${product.supplierEmail}` });
    }
  });

  seed.inventoryLots.forEach((lot, index) => {
    if (lot.quantityRemaining > lot.quantity) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['inventoryLots', index, 'quantityRemaining'], message: 'Remaining quantity cannot exceed received quantity' });
    }
    if (!products.has(lot.productHandle)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['inventoryLots', index, 'productHandle'], message: `Unknown product ${lot.productHandle}` });
    }
    if (!suppliers.has(lot.supplierEmail)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['inventoryLots', index, 'supplierEmail'], message: `Unknown supplier ${lot.supplierEmail}` });
    }
  });
});

export type GroceryOnboardingSeed = z.infer<typeof groceryOnboardingSeedSchema>;

export function parseGroceryOnboardingSeed(input: unknown): GroceryOnboardingSeed {
  const result = groceryOnboardingSeedSchema.safeParse(input);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const path = issue.path.length ? ` at ${issue.path.join('.')}` : '';
  throw new Error(`Invalid grocery onboarding seed${path}: ${issue.message}`);
}
