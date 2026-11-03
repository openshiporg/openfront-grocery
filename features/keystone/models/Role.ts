import { list } from "@keystone-6/core";
import {
  text,
  checkbox,
  relationship,
} from "@keystone-6/core/fields";
import { storeScopedFilter } from '../lib/storeAccess';
import { requireFreshCapability } from '../access';
import { STAFF_CAPABILITIES } from '../lib/staffInvitations';
import { isFreshInstallBootstrapWindow } from '../lib/freshInstallAccess';
import { getPublicStoreId } from '../lib/runtimeConfig';
import { trackingFields } from "./trackingFields";
import { requiredRelationshipPrisma } from './relationshipConfig';

// Generic role administration must not trust capability claims cached in a
// stateless session after revocation, so every gate re-reads the caller's
// current role (canManageUsers is grocery's staff-administration capability).
async function isCurrentStaffAdministrator({ context }: { context: any }) {
  try {
    await requireFreshCapability(context, 'canManageUsers');
    return true;
  } catch {
    return false;
  }
}

/** A role may only grant capabilities its creator currently holds (no self-escalation). */
async function validateGrantedCapabilities({ resolvedData, context, addValidationError }: any) {
  if (!context.session?.itemId) return; // anonymous first-account bootstrap only
  const actor = await context.prisma.user.findUnique({ where: { id: context.session.itemId }, select: { role: true } });
  for (const capability of STAFF_CAPABILITIES) {
    if (resolvedData[capability] === true && (actor?.role as any)?.[capability] !== true) {
      addValidationError(`A role cannot grant ${capability}, which you do not currently hold`);
    }
  }
}

const ownRoleFilter = (session: any) =>
  session?.itemId ? { assignedTo: { some: { id: { equals: session.itemId } } } } : false;

export const Role = list({
  access: {
    // E-commerce parity: staff administrators can create, edit and delete the
    // Store's roles. Roles that people hold change only through the audited,
    // last-manager-safe updateGroceryStaffAccess workflow, so generic update
    // and delete are limited to unassigned roles.
    operation: {
      query: ({ session }) => Boolean(session?.itemId),
      create: isCurrentStaffAdministrator,
      update: isCurrentStaffAdministrator,
      delete: isCurrentStaffAdministrator,
    },
    filter: {
      query: async (args: any) => (await isCurrentStaffAdministrator(args)) ? storeScopedFilter(args) : ownRoleFilter(args.session),
      update: async (args: any) => {
        const store = await storeScopedFilter(args);
        return store === false ? false : { AND: [store as any, { assignedTo: { none: {} } }] };
      },
      delete: storeScopedFilter,
    },
  },
  hooks: {
    validate: {
      create: validateGrantedCapabilities,
      update: validateGrantedCapabilities,
      delete: async ({ item, context, addValidationError }: any) => {
        const assigned = await context.prisma.user.count({ where: { roleId: String(item.id) } });
        if (assigned > 0) addValidationError('Change these staff members\' access before deleting their role');
      },
    },
    resolveInput: {
      create: async ({ resolvedData, context }) => {
        if (!context.session?.itemId) {
          const bootstrapStore = await isFreshInstallBootstrapWindow(context)
            ? await context.prisma.store.findUnique({ where: { id: getPublicStoreId() }, select: { id: true, isActive: true } })
            : null;
          if (!bootstrapStore?.isActive) throw new Error('Active store scope is required');
          return { ...resolvedData, store: { connect: { id: bootstrapStore.id } } };
        }
        const user = await context.prisma.user.findUnique({
          where: { id: context.session.itemId },
          select: { store: { select: { id: true, isActive: true } } },
        });
        if (!user?.store?.isActive) throw new Error('Active store scope is required');
        return { ...resolvedData, store: { connect: { id: user.store.id } } };
      },
    },
  },
  ui: {
    labelField: "name",
    listView: {
      initialColumns: ["name", "canManageProducts", "canManageOrders", "canManageInventory", "canManageOnboarding", "canAccessDashboard"],
    },
  },
  fields: {
    name: text({
      validation: { isRequired: true },
      label: "Role Name",
    }),
    // Permission flags
    canManageProducts: checkbox({
      defaultValue: false,
      label: "Can Manage Products",
    }),
    canManageOrders: checkbox({
      defaultValue: false,
      label: "Can Manage Orders",
    }),
    canManagePayments: checkbox({
      defaultValue: false,
      label: 'Can Manage Payments',
    }),
    canManageInventory: checkbox({
      defaultValue: false,
      label: "Can Manage Inventory",
    }),
    canManageSuppliers: checkbox({
      defaultValue: false,
      label: "Can Manage Suppliers",
    }),
    canManageDelivery: checkbox({
      defaultValue: false,
      label: "Can Manage Delivery Routes",
    }),
    canManageUsers: checkbox({
      defaultValue: false,
      label: "Can Manage Users",
    }),
    canManageOnboarding: checkbox({
      defaultValue: false,
      label: "Can Manage Onboarding",
    }),
    canAccessDashboard: checkbox({
      defaultValue: false,
      label: "Can Access Dashboard",
    }),
    // Relationships
    store: relationship({
      ref: 'Store.roles',
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      // The Store is always derived from the caller (resolveInput), never sent.
      graphql: { isNonNull: { read: true } },
      access: { create: () => false, update: () => false },
    }),
    assignedTo: relationship({
      ref: "User.role",
      many: true,
      // People get access only through the staff workflow.
      access: { create: () => false, update: () => false },
      label: "Assigned To",
    }),
    ...trackingFields,
  },
});
