import { list } from '@keystone-6/core';
import { checkbox, relationship, text } from '@keystone-6/core/fields';
import { trackingFields } from './trackingFields';
import { currentStoreScopedFilter } from '../lib/storeAccess';

export const Store = list({
  access: {
    operation: {
      query: ({ session }) => Boolean(session?.itemId),
      create: () => false,
      update: () => false,
      delete: () => false,
    },
    filter: { query: currentStoreScopedFilter, update: currentStoreScopedFilter, delete: currentStoreScopedFilter },
  },
  hooks: {
    resolveInput: async ({ resolvedData }) => ({
      ...resolvedData,
      code: typeof resolvedData.code === 'string' ? resolvedData.code.trim().toLowerCase() : resolvedData.code,
      name: typeof resolvedData.name === 'string' ? resolvedData.name.trim() : resolvedData.name,
    }),
    validate: {
      delete: async ({ addValidationError }) => addValidationError('Stores with operational evidence cannot be deleted'),
    },
  },
  ui: { labelField: 'name', listView: { initialColumns: ['code', 'name', 'timezone', 'isActive'] } },
  fields: {
    code: text({ isIndexed: 'unique', validation: { isRequired: true }, access: { update: () => false } }),
    name: text({ validation: { isRequired: true } }),
    timezone: text({ defaultValue: 'America/Los_Angeles' }),
    currencyCode: text({ defaultValue: 'USD' }),
    isActive: checkbox({ defaultValue: true }),
    users: relationship({ ref: 'User.store', many: true }),
    roles: relationship({ ref: 'Role.store', many: true }),
    settings: relationship({ ref: 'StoreSettings.store', many: true }),
    loyaltyPrograms: relationship({ ref: 'LoyaltyProgram.store', many: true }),
    carts: relationship({ ref: 'Cart.store', many: true }),
    orders: relationship({ ref: 'Order.store', many: true }),
    products: relationship({ ref: 'Product.store', many: true }),
    departments: relationship({ ref: 'Department.store', many: true }),
    coupons: relationship({ ref: 'Coupon.store', many: true }),
    suppliers: relationship({ ref: 'Supplier.store', many: true }),
    inventoryLots: relationship({ ref: 'InventoryLot.store', many: true }),
    inventoryAdjustments: relationship({ ref: 'InventoryAdjustment.store', many: true }),
    checkoutAttempts: relationship({ ref: 'CheckoutAttempt.store', many: true }),
    deliverySlots: relationship({ ref: 'DeliverySlot.store', many: true }),
    pickupSlots: relationship({ ref: 'PickupSlot.store', many: true }),
    parkingSpots: relationship({ ref: 'ParkingSpot.store', many: true }),
    deliveryRoutes: relationship({ ref: 'DeliveryRoute.store', many: true }),
    purchaseOrders: relationship({ ref: 'PurchaseOrder.store', many: true }),
    payments: relationship({ ref: 'Payment.store', many: true }),
    orderLineInventoryAllocations: relationship({ ref: 'OrderLineInventoryAllocation.store', many: true }),
    paymentWebhookEvents: relationship({ ref: 'PaymentWebhookEvent.store', many: true }),
    outboxEvents: relationship({ ref: 'GroceryOutboxEvent.store', many: true }),
    ...trackingFields,
  },
});
