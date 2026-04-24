import { list } from "@keystone-6/core";
import {
  text,
  float,
  checkbox,
  relationship,
} from "@keystone-6/core/fields";
import { isSignedIn, permissions } from "../access";
import { trackingFields } from "./trackingFields";

export const RecipeIngredient = list({
  access: {
    operation: {
      query: () => true, // Public can view recipe ingredients
      create: isSignedIn,
      update: isSignedIn,
      delete: isSignedIn,
    },
    filter: {
      query: ({ session }) => {
        // Public can see ingredients of published recipes
        // Logged in users can also see ingredients of their own recipes
        if (session?.itemId) {
          return {
            OR: [
              { recipe: { status: { equals: "published" } } },
              { recipe: { author: { id: { equals: session.itemId } } } },
            ],
          };
        }
        return { recipe: { status: { equals: "published" } } };
      },
      update: ({ session }) => {
        if (permissions.canManageProducts({ session })) {
          return true;
        }
        // Users can only update ingredients of their own recipes
        if (session?.itemId) {
          return { recipe: { author: { id: { equals: session.itemId } } } };
        }
        return false;
      },
      delete: ({ session }) => {
        if (permissions.canManageProducts({ session })) {
          return true;
        }
        // Users can only delete ingredients of their own recipes
        if (session?.itemId) {
          return { recipe: { author: { id: { equals: session.itemId } } } };
        }
        return false;
      },
    },
  },
  ui: {
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
      label: "Product",
      ui: {
        description: "Product ID of the ingredient",
      },
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
