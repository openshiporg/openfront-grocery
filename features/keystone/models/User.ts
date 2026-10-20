import { list } from "@keystone-6/core";
import { denyAll } from "@keystone-6/core/access";
import {
  text,
  password,
  relationship,
  select,
  timestamp,
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
      update: async ({ session, context }) => {
        if (!session?.itemId) return false;
        const user = await (context.prisma as any).user.findUnique({ where: { id: session.itemId }, select: { privacyErasedAt: true } });
        return Boolean(user && !user.privacyErasedAt);
      },
      // Customer provisioning and staff lifecycle are dedicated mutations.
      // Generic deletion must never trust stale stateless-session capabilities.
      delete: () => false,
    },
    filter: {
      query: async ({ session, context }) => {
        const store = await storeScopedFilter({ session, context });
        return store === false ? false : { AND: [store, { id: { equals: session?.itemId } }] };
      },
      update: async ({ session, context }) => {
        const store = await storeScopedFilter({ session, context });
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
      // The sign-in identity changes only through updateActiveUser, which
      // requires the current password.
      access: { update: () => false },
    }),
    password: password({
      validation: {
        isRequired: true,
        length: { min: 8, max: 128 },
      },
      access: {
        read: denyAll,
        // Password changes go through updateActiveUserPassword (current password
        // required) or the emailed reset token.
        update: () => false,
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
      // Transitions are owned by updateActiveUser (capability-checked) and
      // runGroceryOnboarding (completion after verified setup).
      access: { update: () => false },
    }),
    staffAccessEvents: relationship({ ref: 'StaffAccessEvent.subject', many: true, access: { update: () => false } }),
    privacyErasedAt: timestamp({ db: { isNullable: true }, access: { create: () => false, update: () => false } }),
    ...trackingFields,
  },
});
