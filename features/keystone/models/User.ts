import { list } from "@keystone-6/core";
import { denyAll } from "@keystone-6/core/access";
import {
  text,
  password,
  relationship,
  select,
} from "@keystone-6/core/fields";
import { isSignedIn } from "../access";
import { trackingFields } from "./trackingFields";
import { requiredRelationshipPrisma } from './relationshipConfig';
import { storeScopedFilter } from '../lib/storeAccess';

export const User = list({
  access: {
    operation: {
      query: isSignedIn,
      // Account creation is intentionally closed at the generic list boundary.
      // A future public signup flow must use a dedicated, rate-limited contract.
      create: () => false,
      update: isSignedIn,
      // Customer provisioning and staff lifecycle are dedicated mutations.
      // Generic deletion must never trust stale stateless-session capabilities.
      delete: () => false,
    },
    filter: {
      query: ({ session }) => {
        const store = storeScopedFilter({ session });
        return store === false ? false : { AND: [store, { id: { equals: session?.itemId } }] };
      },
      update: ({ session }) => {
        const store = storeScopedFilter({ session });
        return store === false ? false : { AND: [store, { id: { equals: session?.itemId } }] };
      },
      delete: storeScopedFilter,
    },
  },
  hooks: {
    validate: {
      update: async ({ item, resolvedData, context, addValidationError }) => {
        const roleId = (resolvedData.role as any)?.connect?.id;
        if (!roleId) return;
        const role = await context.prisma.role.findUnique({ where: { id: roleId }, select: { storeId: true } });
        if (!role?.storeId || role.storeId !== (item as any).storeId) {
          addValidationError('Role must belong to the same Store as the User');
        }
      },
      delete: async ({ item, context, addValidationError }) => {
        const [routeCount, refundCount] = await Promise.all([
          context.prisma.deliveryRoute.count({ where: { driverId: String(item.id) } }),
          context.prisma.paymentRefund.count({ where: { requestedById: String(item.id) } }),
        ]);
        if (routeCount > 0) {
          addValidationError('Users assigned as delivery route drivers cannot be deleted');
        }
        if (refundCount > 0) {
          addValidationError('Users recorded on refund evidence cannot be deleted');
        }
      },
    },
  },
  ui: {
    labelField: "name",
    listView: {
      initialColumns: ["name", "email", "role", "onboardingStatus"],
    },
  },
  fields: {
    name: text({
      validation: { isRequired: true },
      label: "Name",
    }),
    email: text({
      validation: { isRequired: true },
      isIndexed: "unique",
      label: "Email",
    }),
    password: password({
      validation: {
        isRequired: true,
        length: { min: 8, max: 128 },
      },
      access: {
        read: denyAll,
        update: ({ session, item }) => session?.itemId === item.id,
      },
    }),
    store: relationship({
      ref: 'Store.users',
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { create: () => false, update: () => false },
    }),
    role: relationship({
      access: { create: () => false, update: () => false },
      ref: "Role.assignedTo",
      label: "Role",
    }),
    paymentRefunds: relationship({
      ref: 'PaymentRefund.requestedBy',
      many: true,
      access: { update: () => false },
    }),
    onboardingStatus: select({
      type: "enum",
      options: [
        { label: "Not Started", value: "not_started" },
        { label: "In Progress", value: "in_progress" },
        { label: "Completed", value: "completed" },
        { label: "Dismissed", value: "dismissed" },
      ],
      defaultValue: "not_started",
      label: "Onboarding Status",
    }),
    ...trackingFields,
  },
});
