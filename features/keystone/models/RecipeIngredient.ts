import { list } from "@keystone-6/core";
import {
  text,
  float,
  checkbox,
  relationship,
} from "@keystone-6/core/fields";
import { trackingFields } from "./trackingFields";

export const RecipeIngredient = list({
  access: { operation: { query: () => false, create: () => false, update: () => false, delete: () => false } },
  ui: {
    isHidden: true,
    labelField: "product",
    listView: {
      initialColumns: ["recipe", "product", "quantity", "unit", "isOptional"],
    },
  },
  fields: {
    // Recipe relationship
    recipe: relationship({
      ref: "Recipe.ingredients",
      label: "Recipe",
      ui: {
        description: "The recipe this ingredient belongs to",
      },
    }),
    // Product ID (text field as specified)
    product: text({
      validation: { isRequired: true },
      label: "Product Snapshot",
      ui: {
        description: "Legacy product identifier snapshot",
      },
    }),
    productRef: relationship({
      ref: 'Product.recipeIngredients',
      access: { update: () => false },
      label: 'Product',
    }),
    // Quantity needed
    quantity: float({
      validation: { isRequired: true, min: 0 },
      label: "Quantity",
      ui: {
        description: "Amount of the ingredient needed",
      },
    }),
    // Unit of measurement
    unit: text({
      label: "Unit",
      ui: {
        description: "Unit of measurement (e.g., 'cups', 'tbsp', 'oz', 'pieces')",
      },
    }),
    // Additional notes
    notes: text({
      label: "Notes",
      ui: {
        description: "Additional notes (e.g., 'diced', 'melted', 'room temperature')",
        displayMode: "textarea",
      },
    }),
    // Whether the ingredient is optional
    isOptional: checkbox({
      defaultValue: false,
      label: "Is Optional",
      ui: {
        description: "Whether this ingredient is optional for the recipe",
      },
    }),
    ...trackingFields,
  },
});
