import { list } from "@keystone-6/core";
import {
  text,
  select,
  checkbox,
  integer,
  relationship,
  multiselect,
  json,
  float,
  decimal,
} from "@keystone-6/core/fields";
import { document } from "@keystone-6/fields-document";
import { trackingFields } from "./trackingFields";
import { requiredRelationshipPrisma } from './relationshipConfig';
import { permissions } from "../access";
import { currentMembershipStoreId, publicStoreScopedFilter, storeScopedFilter } from '../lib/storeAccess';
import { deriveProductSkuIdentity, normalizeProductSku } from '../lib/productSkuIdentity';
import { initialProductInformation } from '../lib/productInformation';

export async function resolveProductCatalogIdentity({ resolvedData, context, item, operation }: any) {
  const existingStoreId = item?.storeId;
  const session = context.session;
  let actorStoreId: string | undefined;
  if (session?.itemId) {
    actorStoreId = await currentMembershipStoreId({ session, context }) ?? undefined;
    if (!actorStoreId) throw new Error('An active Store account is required for Product writes');
  } else if (operation !== 'update' || Object.entries(resolvedData).some(([key, value]) => value !== undefined && !['stockQuantity', 'inStock'].includes(key))) {
    throw new Error('Catalog identity changes require an active Store account');
  }
  // Guest checkout may adjust only an existing product's stock caches through
  // trusted sudo code. It cannot create a product, choose a SKU or reparent it.
  if (operation === 'update' && (!existingStoreId || (actorStoreId && existingStoreId !== actorStoreId))) throw new Error('Product belongs to another Store');
  const storeId = operation === 'update' ? existingStoreId : actorStoreId;
  if (!storeId) throw new Error('A Product must belong to one Store');
  if (resolvedData.store !== undefined && (!resolvedData.store || resolvedData.store.connect?.id !== storeId || Object.keys(resolvedData.store).some(key => key !== 'connect'))) throw new Error('Product Store ownership cannot be reassigned');
  const sku = normalizeProductSku(resolvedData.sku !== undefined ? resolvedData.sku : item?.sku);
  if (operation === 'update' && ['unitOfMeasure','pricingMethod'].some(key => resolvedData[key] !== undefined && resolvedData[key] !== item?.[key])) {
    const [lots, orders, purchasing] = await Promise.all([
      context.prisma.inventoryLot.count({where:{productId:String(item.id)}}),
      context.prisma.orderLineItem.count({where:{productId:String(item.id)}}),
      context.prisma.pOItem.count({where:{productId:String(item.id)}}),
    ]);
    if (lots + orders + purchasing > 0) throw new Error('Physical units on stocked or historically transacted products are immutable; create a separate SKU');
  }
  return {
    ...resolvedData,
    sku,
    skuIdentity: deriveProductSkuIdentity(storeId, sku),
    priceCents: resolvedData.price !== undefined ? Math.round(Number(resolvedData.price) * 100) : resolvedData.priceCents,
    costPriceCents: resolvedData.costPrice !== undefined ? Math.round(Number(resolvedData.costPrice) * 100) : resolvedData.costPriceCents,
    ...(operation === 'create' ? { store: { connect: { id: storeId } }, initialInformation:initialProductInformation(resolvedData,session.itemId,'operator_catalog_create') } : {}),
  };
}

export const Product = list({
  access: {
    operation: {
      query: () => true, // Public can view products
      create: permissions.canManageProducts,
      update: permissions.canManageProducts,
      delete: permissions.canManageProducts,
    },
    filter: {
      query: async ({ session, context }) => {
        const store = await storeScopedFilter({ session, context });
        if (await permissions.canManageProducts({ session, context })) return store;
        return { AND: [publicStoreScopedFilter(), { status: { equals: "published" } }] };
      },
      update: storeScopedFilter,
      delete: storeScopedFilter,
    },
  },
  hooks: {
    resolveInput: resolveProductCatalogIdentity,
    validate: {
      create: async ({ resolvedData, context, addValidationError }) => {
        const storeId = await currentMembershipStoreId({ session: context.session, context });
        const supplierId = resolvedData.supplier?.connect?.id;
        const departmentId = resolvedData.departmentRef?.connect?.id;
        if (supplierId) {
          const supplier = await context.prisma.supplier.findUnique({ where: { id: String(supplierId) }, select: { storeId: true } });
          if (!supplier || supplier.storeId !== storeId) addValidationError('Supplier must belong to the active store');
        }
        if (departmentId) {
          const department = await context.prisma.department.findUnique({ where: { id: String(departmentId) }, select: { storeId: true } });
          if (!department || department.storeId !== storeId) addValidationError('Department must belong to the active store');
        }
      },
      update: async ({ resolvedData, context, addValidationError }) => {
        const storeId = await currentMembershipStoreId({ session: context.session, context });
        const supplierId = resolvedData.supplier?.connect?.id;
        const departmentId = resolvedData.departmentRef?.connect?.id;
        if (supplierId) {
          const supplier = await context.prisma.supplier.findUnique({ where: { id: String(supplierId) }, select: { storeId: true } });
          if (!supplier || supplier.storeId !== storeId) addValidationError('Supplier must belong to the active store');
        }
        if (departmentId) {
          const department = await context.prisma.department.findUnique({ where: { id: String(departmentId) }, select: { storeId: true } });
          if (!department || department.storeId !== storeId) addValidationError('Department must belong to the active store');
        }
      },
      delete: async ({ item, context, addValidationError }) => {
        const productId = String(item.id);
        const [lotCount, poItemCount, orderLineItemCount, cartItemCount, shoppingListItemCount, subscriptionCount, recipeIngredientCount, favoriteProductCount, alertCount] = await Promise.all([
          context.prisma.inventoryLot.count({ where: { productId } }),
          context.prisma.pOItem.count({ where: { productId } }),
          context.prisma.orderLineItem.count({ where: { productId } }),
          context.prisma.cartItem.count({ where: { productId } }),
          context.prisma.shoppingListItem.count({ where: { productRefId: productId } }),
          context.prisma.subscription.count({ where: { productRefId: productId } }),
          context.prisma.recipeIngredient.count({ where: { productRefId: productId } }),
          context.prisma.favoriteProduct.count({ where: { productRefId: productId } }),
          Promise.all([
            context.prisma.backInStockAlert.count({ where: { productRefId: productId } }),
            context.prisma.priceAlert.count({ where: { productRefId: productId } }),
          ]).then(([backInStock, price]) => backInStock + price),
        ]);
        if (Number(item.stockQuantity || 0) > 0 || lotCount > 0) {
          addValidationError('Stocked products must be archived instead of deleted');
        }
        if (poItemCount > 0) {
          addValidationError('Products referenced by purchase orders must be archived instead of deleted');
        }
        if (orderLineItemCount > 0) {
          addValidationError('Products referenced by order history must be archived instead of deleted');
        }
        if (cartItemCount + shoppingListItemCount + subscriptionCount + recipeIngredientCount + favoriteProductCount + alertCount > 0) {
          addValidationError('Product catalog references cannot be deleted');
        }
      },
    },
  },
  ui: {
    labelField: "title",
    listView: {
      initialColumns: ["title", "department", "pricingMethod", "isPerishable", "status"],
    },
  },
  fields: {
    skuIdentity: text({
      isIndexed: 'unique',
      db: { isNullable: true },
      access: { read: () => false, create: () => false, update: () => false },
      ui: { createView: { fieldMode: 'hidden' }, itemView: { fieldMode: 'hidden' } },
    }),
    variantOf: relationship({ref:'Product',access:{create:()=>false,update:()=>false}}),
    variantLabel: text({access:{create:()=>false,update:()=>false}}),
    packBaseUnitsMilli: integer({defaultValue:1000,validation:{isRequired:true,min:1},access:{create:()=>false,update:()=>false}}),
    nutrition: json({defaultValue:{},access:{create:()=>false,update:()=>false}}),
    informationSource: text({access:{create:()=>false,update:()=>false}}),
    initialInformation: json({defaultValue:{},access:{read:permissions.canManageProducts,create:()=>false,update:()=>false}}),
    title: text({
      validation: { isRequired: true },
      label: "Product Title",
    }),
    description: document({
      formatting: true,
      links: true,
      dividers: true,
      layouts: [
        [1, 1],
        [1, 1, 1],
      ],
    }),
    handle: text({
      isIndexed: "unique",
      label: "Handle",
      ui: {
        description: "URL-friendly identifier",
      },
    }),
    sku: text({
      label: "SKU",
      ui: {
        description: "Stock Keeping Unit",
      },
    }),
    status: select({
      type: "enum",
      options: [
        { label: "Draft", value: "draft" },
        { label: "Published", value: "published" },
        { label: "Archived", value: "archived" },
      ],
      defaultValue: "draft",
      validation: { isRequired: true },
    }),
    metadata: json({ access: { read: permissions.canManageProducts } }),

    // Pricing fields
    price: float({
      label: "Legacy display price (USD)",
      ui: {
        description: "Product price in dollars",
      },
      validation: { min: 0 },
    }),
    priceCents: integer({ access: { create: () => false, update: () => false }, defaultValue: 0, validation: { isRequired: true, min: 0 }, label: 'Authoritative price (minor units)' }),
    compareAtPrice: float({
      label: "Compare at Price",
      ui: {
        description: "Original price for sale items",
      },
      validation: { min: 0 },
    }),
    costPrice: float({
      access: { read: permissions.canManageProducts },
      label: "Cost Price",
      ui: {
        description: "Cost to purchase from supplier",
      },
      validation: { min: 0 },
    }),
    costPriceCents: integer({ access: { read: permissions.canManageProducts, create: () => false, update: () => false }, defaultValue: 0, validation: { isRequired: true, min: 0 }, label: 'Authoritative cost (minor units)' }),

    // Inventory fields
    inStock: checkbox({
      access: { read: permissions.canManageProducts, create: () => false, update: () => false },
      defaultValue: false,
      label: "In Stock",
      ui: {
        description: "Reporting cache only; public sellability is derived from Store-owned unexpired inventory lots",
      },
    }),
    stockQuantity: decimal({ precision: 18, scale: 3,
      access: {
        read: permissions.canManageProducts,
        create: () => false,
        update: () => false,
      },
      defaultValue: "0",
      label: "Stock Quantity",
      ui: {
        description: "Reporting cache only; public sellable quantity is derived from Store-owned unexpired inventory lots",
      },
      validation: { min: "0" },
    }),
    lowStockThreshold: integer({
      access: { read: permissions.canManageProducts },
      defaultValue: 10,
      label: "Low Stock Threshold",
      ui: {
        description: "Alert when stock falls below this number",
      },
    }),

    // Media
    imageUrl: text({
      label: "Image URL",
      ui: {
        description: "Main product image URL",
      },
    }),
    thumbnailUrl: text({
      label: "Thumbnail URL",
      ui: {
        description: "Small product thumbnail URL",
      },
    }),

    // Grocery-specific fields
    department: select({
      type: "enum",
      options: [
        { label: "Produce", value: "produce" },
        { label: "Meat", value: "meat" },
        { label: "Seafood", value: "seafood" },
        { label: "Dairy", value: "dairy" },
        { label: "Bakery", value: "bakery" },
        { label: "Deli", value: "deli" },
        { label: "Frozen", value: "frozen" },
        { label: "Pantry", value: "pantry" },
        { label: "Beverages", value: "beverages" },
        { label: "Snacks", value: "snacks" },
        { label: "Health & Beauty", value: "health_beauty" },
        { label: "Household", value: "household" },
      ],
      label: "Department",
      ui: {
        description: "Store department for this product",
      },
    }),
    isPerishable: checkbox({
      defaultValue: false,
      label: "Perishable",
      ui: {
        description: "Product requires refrigeration or has expiration date",
      },
    }),
    shelfLife: integer({
      label: "Shelf Life (days)",
      ui: {
        description: "Number of days product remains fresh",
      },
    }),
    taxRateBasisPoints: integer({
      validation: { min: 0, max: 10000 },
      db: { isNullable: true },
      ui: { description: 'Item tax basis points; blank inherits the Store rate, zero is exempt. Confirm your configured policy.' },
    }),
    pricingMethod: select({
      type: "enum",
      options: [
        { label: "Per Unit", value: "unit" },
        { label: "Per Weight", value: "weight" },
        { label: "Per Volume", value: "volume" },
      ],
      defaultValue: "unit",
      label: "Pricing Method",
      ui: {
        description: "How this product is priced",
      },
    }),
    unitOfMeasure: select({
      type: "enum",
      options: [
        { label: "Each", value: "each" },
        { label: "Pound (lb)", value: "lb" },
        { label: "Ounce (oz)", value: "oz" },
        { label: "Kilogram (kg)", value: "kg" },
        { label: "Gram (g)", value: "g" },
        { label: "Liter (L)", value: "L" },
        { label: "Milliliter (mL)", value: "mL" },
        { label: "Gallon", value: "gallon" },
        { label: "Quart", value: "quart" },
        { label: "Pint", value: "pint" },
      ],
      defaultValue: "each",
      label: "Unit of Measure",
    }),
    organicCertified: checkbox({
      defaultValue: false,
      label: "Organic Certified",
      ui: {
        description: "Product is certified organic",
      },
    }),
    allergens: multiselect({
      access: { update: () => false },
      type: "enum",
      options: [
        { label: "Milk", value: "milk" },
        { label: "Eggs", value: "eggs" },
        { label: "Fish", value: "fish" },
        { label: "Shellfish", value: "shellfish" },
        { label: "Tree Nuts", value: "tree_nuts" },
        { label: "Peanuts", value: "peanuts" },
        { label: "Wheat", value: "wheat" },
        { label: "Soybeans", value: "soybeans" },
        { label: "Sesame", value: "sesame" },
      ],
      label: "Allergens",
      ui: {
        description: "Common allergens contained in this product",
      },
    }),

    // Relationships
    store: relationship({
      ref: 'Store.products',
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { create: permissions.canManageProducts, update: () => false },
    }),
    supplier: relationship({
      access: { read: permissions.canManageProducts },
      ref: "Supplier.products",
      label: "Supplier",
    }),
    departmentRef: relationship({
      ref: "Department.products",
      label: "Department Reference",
    }),
    inventoryLots: relationship({
      access: {
        read: permissions.canManageProducts,
        update: () => false,
      },
      ref: "InventoryLot.product",
      many: true,
      label: "Inventory Lots",
    }),
    favoriteProducts: relationship({ ref: 'FavoriteProduct.productRef', many: true, access: { update: () => false } }),
    backInStockAlerts: relationship({ ref: 'BackInStockAlert.productRef', many: true, access: { update: () => false } }),
    priceAlerts: relationship({ ref: 'PriceAlert.productRef', many: true, access: { update: () => false } }),
    shoppingListItems: relationship({ ref: 'ShoppingListItem.productRef', many: true, access: { update: () => false } }),
    subscriptions: relationship({ ref: 'Subscription.productRef', many: true, access: { update: () => false } }),
    recipeIngredients: relationship({ ref: 'RecipeIngredient.productRef', many: true, access: { update: () => false } }),
    ...trackingFields,
  },
});
