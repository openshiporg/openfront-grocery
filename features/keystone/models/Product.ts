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
} from "@keystone-6/core/fields";
import { document } from "@keystone-6/fields-document";
import { trackingFields } from "./trackingFields";
import { isSignedIn, permissions } from "../access";

export const Product = list({
  access: {
    operation: {
      query: () => true, // Public can view products
      create: permissions.canManageProducts,
      update: permissions.canManageProducts,
      delete: permissions.canManageProducts,
    },
    filter: {
      query: ({ session }) => {
        if (permissions.canManageProducts({ session })) {
          return true;
        }
        return {
          status: {
            equals: "published",
          },
        };
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
    metadata: json(),

    // Pricing fields
    price: float({
      label: "Price",
      ui: {
        description: "Product price in dollars",
      },
      validation: { min: 0 },
    }),
    compareAtPrice: float({
      label: "Compare at Price",
      ui: {
        description: "Original price for sale items",
      },
      validation: { min: 0 },
    }),
    costPrice: float({
      label: "Cost Price",
      ui: {
        description: "Cost to purchase from supplier",
      },
      validation: { min: 0 },
    }),

    // Inventory fields
    inStock: checkbox({
      defaultValue: true,
      label: "In Stock",
      ui: {
        description: "Product is available for purchase",
      },
    }),
    stockQuantity: integer({
      defaultValue: 0,
      label: "Stock Quantity",
      ui: {
        description: "Available inventory count",
      },
      validation: { min: 0 },
    }),
    lowStockThreshold: integer({
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
    supplier: relationship({
      ref: "Supplier.products",
      label: "Supplier",
    }),
    departmentRef: relationship({
      ref: "Department.products",
      label: "Department Reference",
    }),
    inventoryLots: relationship({
      ref: "InventoryLot.product",
      many: true,
      label: "Inventory Lots",
    }),
    ...trackingFields,
  },
});
