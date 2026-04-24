import { list } from "@keystone-6/core";
import {
  text,
  select,
  integer,
  json,
  relationship,
} from "@keystone-6/core/fields";
import { trackingFields } from "./trackingFields";
import { isSignedIn, permissions } from "../access";

export const Recipe = list({
  access: {
    operation: {
      query: () => true, // Public can view recipes
      create: permissions.canManageProducts,
      update: permissions.canManageProducts,
      delete: permissions.canManageProducts,
    },
  },
  ui: {
    labelField: "name",
    listView: {
      initialColumns: ["name", "prepTime", "cookTime", "servings", "difficulty"],
    },
  },
  fields: {
    name: text({
      validation: { isRequired: true },
      label: "Recipe Name",
    }),
    description: text({
      label: "Description",
      ui: {
        description: "Brief description of the recipe",
        displayMode: "textarea",
      },
    }),
    instructions: text({
      validation: { isRequired: true },
      label: "Instructions",
      ui: {
        description: "Step-by-step cooking instructions",
        displayMode: "textarea",
      },
    }),
    prepTime: integer({
      label: "Prep Time (minutes)",
      ui: {
        description: "Time required for preparation",
      },
      validation: { min: 0 },
    }),
    cookTime: integer({
      label: "Cook Time (minutes)",
      ui: {
        description: "Time required for cooking",
      },
      validation: { min: 0 },
    }),
    servings: integer({
      label: "Servings",
      ui: {
        description: "Number of servings this recipe makes",
      },
      validation: { min: 1 },
    }),
    difficulty: select({
      type: "enum",
      options: [
        { label: "Easy", value: "easy" },
        { label: "Medium", value: "medium" },
        { label: "Hard", value: "hard" },
      ],
      defaultValue: "medium",
      label: "Difficulty",
      ui: {
        description: "Difficulty level of the recipe",
      },
    }),
    image: text({
      label: "Image URL",
      ui: {
        description: "URL for the recipe image",
      },
    }),
    categories: json({
      label: "Categories",
      ui: {
        description: "JSON array of recipe categories (e.g., breakfast, dinner, vegetarian)",
      },
    }),
    // Ingredients relationship
    ingredients: relationship({
      ref: "RecipeIngredient.recipe",
      many: true,
      label: "Ingredients",
      ui: {
        description: "Ingredients needed for this recipe",
      },
    }),
    ...trackingFields,
  },
});
