import { list } from "@keystone-6/core";
import {
  text,
  float,
  checkbox,
  json,
} from "@keystone-6/core/fields";
import { trackingFields } from "./trackingFields";
import { permissions } from "../access";

export const LoyaltyProgram = list({
  access: {
    operation: {
      query: () => true, // Public can view loyalty program details
      create: permissions.canManageUsers,
      update: permissions.canManageUsers,
      delete: permissions.canManageUsers,
    },
  },
  ui: {
    labelField: "name",
    listView: {
      initialColumns: ["name", "pointsPerDollar", "isActive"],
    },
  },
  fields: {
    // Program name
    name: text({
      validation: { isRequired: true },
      label: "Program Name",
      ui: {
        description: "Name of the loyalty program (e.g., 'Grocery Rewards', 'Fresh Points')",
      },
    }),
    // Points earned per dollar spent
    pointsPerDollar: float({
      validation: { isRequired: true, min: 0 },
      defaultValue: 1,
      label: "Points Per Dollar",
      ui: {
        description: "How many points customers earn per dollar spent",
      },
    }),
    // Tier configuration and thresholds
    tierConfiguration: json({
      label: "Tier Configuration",
      ui: {
        description: "JSON configuration for tier levels, thresholds, and benefits. Example: [{\"name\":\"Bronze\",\"threshold\":0,\"benefits\":[\"1x points\"]},{\"name\":\"Silver\",\"threshold\":500,\"benefits\":[\"1.5x points\",\"Free delivery over $50\"]},{\"name\":\"Gold\",\"threshold\":2000,\"benefits\":[\"2x points\",\"Free delivery\",\"Birthday rewards\"]},{\"name\":\"Platinum\",\"threshold\":5000,\"benefits\":[\"3x points\",\"Free delivery\",\"Exclusive deals\",\"Early access\"]}]",
        views: "./admin/json-view",
        createView: {
          fieldMode: "edit",
        },
      },
    }),
    // Point redemption rules
    redemptionRules: json({
      label: "Redemption Rules",
      ui: {
        description: "JSON configuration for point redemption rules. Example: {\"pointsPerDollar\":100,\"minimumRedemption\":100,\"maximumRedemption\":5000}",
        views: "./admin/json-view",
        createView: {
          fieldMode: "edit",
        },
      },
    }),
    // Points expiration configuration
    expirationRules: json({
      label: "Expiration Rules",
      ui: {
        description: "JSON configuration for point expiration. Example: {\"enabled\":true,\"expirationDays\":365,\"warningDays\":30}",
        views: "./admin/json-view",
        createView: {
          fieldMode: "edit",
        },
      },
    }),
    // Additional benefits per tier
    tierBenefits: json({
      label: "Tier Benefits",
      ui: {
        description: "Additional tier-specific benefits like free delivery thresholds, birthday rewards, etc.",
        views: "./admin/json-view",
        createView: {
          fieldMode: "edit",
        },
      },
    }),
    // Whether the program is currently active
    isActive: checkbox({
      defaultValue: true,
      label: "Is Active",
      ui: {
        description: "Whether this loyalty program is currently active",
      },
    }),
    ...trackingFields,
  },
});
