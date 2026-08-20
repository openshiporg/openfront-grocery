import { mergeSchemas } from "@graphql-tools/schema";
import { GraphQLScalarType, Kind, type GraphQLSchema, type ValueNode } from 'graphql';
import redirectToInit from "./redirectToInit";
import updateActiveUser from "./updateActiveUser";
import {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
  mergeGuestCart,
  updateSubstitutionPreference,
} from "./cartOperations";
import { getClippedCoupons } from "./clipCoupon";
import {
  addToList,
  removeFromList,
  updateListItemQuantity,
  toggleListItemChecked,
  addListToCart,
} from "./manageShoppingList";
import {
  createShoppingList,
  deleteShoppingList,
} from './manageShoppingLists';
import {
  getAvailablePickupSlots,
  getPickupSlotsByDate,
} from "./getAvailablePickupSlots";
import {
  customerCheckIn,
  guestCustomerCheckIn,
  getAvailableParkingSpots,
  releaseParkingSpot,
  completeOrderHandoff,
} from "./customerCheckIn";
import submitGroceryOrder from './submitGroceryOrder';
import initiatePaymentSession from './initiatePaymentSession';
import { getGuestGroceryOrder } from './getGuestGroceryOrder';
import { handlePaymentProviderWebhook } from './handlePaymentProviderWebhook';
import {
  createDeliveryRouteFromOrders,
  updateDeliveryRouteWorkflow,
} from './manageDeliveryRoutes';
import { getPublicGroceryAvailability } from './getPublicGroceryAvailability';
import { getPublicGroceryCoupons } from './getPublicGroceryCoupons';
import {
  getPublicGroceryStorefrontSettings,
  updateGroceryStorefrontBrandHue,
} from './getPublicGroceryStorefrontSettings';
import {
  getPublicGroceryProduct,
  getPublicGroceryProducts,
  requestGroceryBackInStockAlert,
} from './getPublicGroceryCatalog';
import { STRIPE_PROVIDER_CODE } from '../../integrations/payment';
import { runGroceryOnboarding } from './runGroceryOnboarding';
import {
  receivePurchaseOrder,
  transitionPurchaseOrder,
} from './managePurchaseOrderReceiving';
import { createPurchaseOrderDraft } from './createPurchaseOrderDraft';
import { removePurchaseOrderDraftItem } from './removePurchaseOrderDraftItem';
import { adjustInventoryLot } from './adjustInventoryLot';
import { advanceOrderFulfillment } from './manageOrderFulfillment';
import { cancelGroceryOrder } from './cancelOrder';
import { reconcileCheckoutAttempts } from './reconcileCheckoutAttempts';
import { reconcilePaymentRefunds } from './reconcilePaymentRefunds';
import { updateSupplierMinimumOrder } from './updateSupplierMinimumOrder';
import { recordOrderItemSubstitution } from './manageOrderSubstitution';
import { refundPaymentForOrder } from './managePaymentRefund';
import {
  claimGroceryOutboxEvents,
  completeGroceryOutboxEvent,
  groceryOutboxStatus,
  replayGroceryOutboxEvent,
} from './manageGroceryOutbox';
import { configureDeliverySlot, configureParkingSpot, configurePickupSlot } from './manageStoreCapacity';
import { provisionGroceryCustomer } from './provisionCustomer';
import {
  groceryPlatformOrders,
  groceryPlatformFulfillment,
  groceryPlatformDelivery,
  groceryPlatformPickup,
  groceryPlatformInventory,
  groceryPlatformSuppliers,
  groceryPlatformPurchasing,
  groceryPlatformMerchandising,
  groceryPlatformCustomers,
  groceryPlatformPayments,
  groceryPlatformSettings,
} from '../projections/platformProjections';

const graphql = String.raw;

function parseJSONLiteral(ast: ValueNode): unknown {
  switch (ast.kind) {
    case Kind.STRING:
    case Kind.BOOLEAN:
      return ast.value;
    case Kind.INT:
    case Kind.FLOAT:
      return Number(ast.value);
    case Kind.OBJECT:
      return Object.fromEntries(ast.fields.map((field) => [field.name.value, parseJSONLiteral(field.value)]));
    case Kind.LIST:
      return ast.values.map(parseJSONLiteral);
    case Kind.NULL:
      return null;
    default:
      return null;
  }
}

const JSONScalar: GraphQLScalarType = new GraphQLScalarType({
  name: 'JSON',
  description: 'Arbitrary JSON payload for provider webhook events.',
  parseValue: (value) => value,
  serialize: (value) => value,
  parseLiteral: parseJSONLiteral,
});

export function extendGraphqlSchema(baseSchema: GraphQLSchema) {
  return mergeSchemas({
    schemas: [baseSchema],
    typeDefs: graphql`
      input UserUpdateProfileInput {
        email: String
        name: String
        onboardingStatus: String
      }

      type GroceryCartProduct {
        id: ID!
        name: String
        handle: String
        price: Float
        unitPrice: Float
        unit: String
        imageUrl: String
        inStock: Boolean
        stockQuantity: Int
      }

      type GroceryCartItem {
        id: ID!
        product: GroceryCartProduct
        quantity: Int!
        subtotal: Float!
        substitutionPreference: String
      }

      type GroceryCart {
        id: ID!
        items: [GroceryCartItem!]!
        subtotal: Float!
        tax: Float!
        deliveryFee: Float!
        total: Float!
        itemCount: Int!
      }

      # Coupon types
      type ClippedCouponDetails {
        id: ID!
        code: String!
        discountType: String!
        discountValue: Float!
        minPurchase: Float
        validTo: String
        productCategories: [String]
      }

      type ClippedCoupon {
        id: ID!
        clippedAt: String!
        coupon: ClippedCouponDetails!
      }

      type ClipCouponResult {
        success: Boolean!
        message: String!
        userCoupon: ClippedCoupon
      }

      type UnclipCouponResult {
        success: Boolean!
        message: String!
      }

      type CouponBreakdownItem {
        couponId: ID!
        couponCode: String!
        discountType: String!
        discountAmount: Float!
        appliedToProducts: [ID!]!
      }

      type ApplyCouponsResult {
        success: Boolean!
        totalDiscount: Float!
        breakdown: [CouponBreakdownItem!]!
        warnings: [String!]!
        finalSubtotal: Float!
      }

      type MarkCouponsUsedResult {
        success: Boolean!
        markedAsUsed: [ID!]!
      }

      type PreviewCouponDetails {
        code: String!
        discountType: String!
        discountValue: Float!
        minPurchase: Float
      }

      type PreviewCouponResult {
        valid: Boolean!
        message: String!
        potentialDiscount: Float!
        couponDetails: PreviewCouponDetails
      }

      # Recipe types
      type ScaledIngredientProduct {
        id: ID!
        name: String
        price: Float
        imageUrl: String
        inStock: Boolean
        stockQuantity: Int
      }

      type ScaledIngredient {
        id: ID!
        productId: String
        product: ScaledIngredientProduct
        originalQuantity: Float!
        scaledQuantity: Float!
        unit: String
        notes: String
        isOptional: Boolean
      }

      type ScaledRecipe {
        recipeId: ID!
        recipeName: String!
        originalServings: Int!
        targetServings: Int!
        scaleFactor: Float!
        ingredients: [ScaledIngredient!]!
      }

      type RecipeCartAddedItem {
        productId: String!
        productName: String
        quantity: Int!
        action: String!
        newTotal: Int
      }

      type RecipeCartUnavailableItem {
        productId: String
        productName: String
        reason: String!
        availableQuantity: Int
        requestedQuantity: Int
        existingQuantity: Int
      }

      type RecipeCartSkippedItem {
        productId: String
        reason: String!
      }

      type RecipeCartSummary {
        addedCount: Int!
        unavailableCount: Int!
        skippedOptionalCount: Int!
        addedItems: [RecipeCartAddedItem!]!
        unavailableItems: [RecipeCartUnavailableItem!]!
        skippedOptional: [RecipeCartSkippedItem!]!
      }

      type AddRecipeToCartResult {
        cart: GroceryCart!
        recipeId: ID!
        recipeName: String!
        servingsAdded: Int!
        summary: RecipeCartSummary!
      }

      # Shopping List types
      type ShoppingListItemResult {
        id: ID!
        product: String!
        quantity: Int!
        unit: String
        checked: Boolean!
        notes: String
        addedAt: String
      }

      type ShoppingListResult {
        id: ID!
        name: String!
        isDefault: Boolean!
        items: [ShoppingListItemResult!]!
        itemCount: Int!
        checkedCount: Int!
      }

      type DeleteShoppingListResult {
        success: Boolean!
        listId: ID!
      }

      type AddListToCartResult {
        success: Boolean!
        message: String!
        addedCount: Int!
        skippedCount: Int!
        skippedItems: [String!]!
      }

      type PublicGroceryStorefrontSettings {
        id: ID!
        name: String!
        tagline: String
        homepageTitle: String
        homepageDescription: String
        contactEmail: String
        contactPhone: String
        address: String
        logoUrl: String
        brandHue: Int
        effectiveBrandHue: Int!
        currencyCode: String
        locale: String
        timezone: String
        countryCode: String
      }

      type StorefrontBrandHueResult {
        brandHue: Int
        effectiveBrandHue: Int!
      }

      type PublicGroceryDepartment {
        id: ID!
        name: String!
        handle: String!
        isActive: Boolean!
      }

      type PublicGroceryProduct {
        id: ID!
        title: String!
        handle: String!
        description: JSON
        sku: String!
        price: Float
        compareAtPrice: Float
        unitOfMeasure: String
        pricingMethod: String
        imageUrl: String
        thumbnailUrl: String
        isPerishable: Boolean!
        shelfLife: Int
        organicCertified: Boolean!
        allergens: [String!]!
        department: PublicGroceryDepartment
        inStock: Boolean!
        stockQuantity: Int!
        backInStockRequested: Boolean!
      }

      type PublicGroceryProductConnection {
        products: [PublicGroceryProduct!]!
        totalCount: Int!
      }

      type BackInStockRequestResult {
        requested: Boolean!
        reused: Boolean!
        productId: ID!
        message: String!
      }

      type PublicGroceryCoupon {
        id: ID!
        code: String!
        discountType: String!
        discountValue: Float!
        minPurchase: Float!
        validTo: String
        productCategories: [String!]!
      }

      type PublicDeliveryWindow {
        id: ID!
        date: String!
        startTime: String!
        endTime: String!
        feeCents: Int!
        remainingCapacity: Int!
      }

      type PublicPickupWindow {
        id: ID!
        date: String!
        startTime: String!
        endTime: String!
        remainingCapacity: Int!
      }

      type PublicParkingSpot {
        id: ID!
        spotNumber: String!
        description: String
        isAccessible: Boolean!
      }

      type PublicGroceryAvailability {
        deliveryWindows: [PublicDeliveryWindow!]!
        pickupWindows: [PublicPickupWindow!]!
        parkingSpots: [PublicParkingSpot!]!
      }

      # Pickup Slot types
      type PickupSlotResult {
        id: ID!
        date: String!
        startTime: String!
        endTime: String!
        availableCapacity: Int!
        maxOrders: Int!
        currentOrders: Int!
        isAvailable: Boolean!
      }

      type PickupSlotsByDateResult {
        date: String!
        slots: [PickupSlotResult!]!
        totalSlots: Int!
        totalAvailableCapacity: Int!
      }

      # Customer Check-in types
      type ParkingSpotResult {
        id: ID!
        spotNumber: String!
        description: String
        isAccessible: Boolean!
        isAvailable: Boolean!
      }

      type CheckInParkingSpot {
        id: ID!
        spotNumber: String!
        description: String
        isAccessible: Boolean!
      }

      type CustomerCheckInResult {
        success: Boolean!
        orderId: ID!
        orderNumber: Int!
        status: String!
        parkingSpot: CheckInParkingSpot
        estimatedWaitMinutes: Int!
        message: String!
      }

      type ReleaseParkingSpotResult {
        success: Boolean!
        parkingSpotId: ID!
        spotNumber: String!
        orderId: ID!
        message: String!
      }

      type CompleteOrderHandoffResult {
        success: Boolean!
        orderId: ID!
        orderNumber: Int!
        status: String!
        message: String!
      }

      type DeliveryRouteWorkflowResult {
        success: Boolean!
        routeId: ID!
        status: String!
        orderCount: Int!
        message: String!
      }

      type OrderCancellationResult { success: Boolean!, orderId: ID!, status: String!, reused: Boolean! }
      type ProvisionGroceryCustomerResult { success: Boolean!, customerId: ID!, name: String!, email: String! }
      type CheckoutReconciliationResult { processed: Int!, results: JSON! }
      type RefundReconciliationResult { scanned: Int!, results: JSON! }
      type SupplierMinimumOrderResult { success: Boolean!, id: ID!, minimumOrder: Float!, minimumOrderCents: Int! }
      type OrderFulfillmentWorkflowResult {
        success: Boolean!
        orderId: ID!
        status: String!
        stage: String!
        reused: Boolean!
        message: String!
      }

      type OrderItemSubstitutionWorkflowResult {
        success: Boolean!
        substitutionId: ID!
        orderItemId: ID!
        customerApproved: Boolean!
        approvedAt: String
        reused: Boolean!
      }

      type GroceryOutboxEventResult {
        eventId: ID!
        eventKey: String!
        eventType: String!
        aggregateType: String!
        aggregateId: String!
        schemaVersion: Int!
        payload: JSON!
        payloadHash: String!
        occurredAt: String!
        status: String!
        attempts: Int!
        claimToken: String
      }

      type GroceryOutboxStatusResult {
        pending: Int!
        processing: Int!
        delivered: Int!
        failed: Int!
      }

      type StoreCapacityResult {
        slotId: ID!
        capacity: Int!
        currentBookings: Int!
        isAvailable: Boolean!
        fee: Int!
        reused: Boolean!
      }

      type InventoryAdjustmentResult {
        success: Boolean!
        adjustmentId: ID!
        inventoryLotId: ID!
        productId: ID!
        quantityDelta: Int!
        quantityRemaining: Int!
        productStock: Int!
        reused: Boolean!
      }

      input PurchaseOrderDraftItemInput {
        productId: ID!
        quantity: Int!
        unitCost: Float!
      }

      type PurchaseOrderDraftResult {
        success: Boolean!
        purchaseOrderId: ID!
        poNumber: String!
        status: String!
        totalAmount: Float!
        itemCount: Int!
        reused: Boolean!
      }

      type PurchaseOrderDraftItemRemovalResult {
        success: Boolean!
        purchaseOrderId: ID!
        removedItemId: ID!
        totalAmount: Float!
        itemCount: Int!
        reused: Boolean!
      }

      input PurchaseOrderReceiptInput {
        poItemId: ID!
        targetQuantityReceived: Int!
        lotNumber: String!
        expirationDate: String!
        location: String
      }

      type PurchaseOrderWorkflowResult {
        success: Boolean!
        purchaseOrderId: ID!
        status: String!
        receivedUnits: Int!
        message: String!
      }

      scalar JSON

      type GroceryOnboardingResult {
        completed: Boolean!
        reused: Boolean!
        counts: JSON!
      }

      type PaymentWebhookResult {
        success: Boolean!
        duplicate: Boolean!
        providerCode: String!
        eventType: String!
        paymentId: String
        updatedPaymentId: ID
        message: String!
      }

      type PaymentRefundResult {
        success: Boolean!
        refundId: ID!
        paymentId: ID!
        amountCents: Int!
        status: String!
        providerRefundId: String
        reused: Boolean!
        message: String!
      }

      type GroceryPlatformOrderLineItem {
        id: ID!
        title: String!
        sku: String!
        quantity: Int!
        unitPrice: Float!
        unitPriceCents: Int!
        thumbnail: String!
        metadata: JSON
      }

      type GroceryPlatformPaymentRefund {
        id: ID!
        amountCents: Int!
        status: String!
        reason: String!
        requestedAt: String
        processedAt: String
        failureMessage: String
        reconciliationAttempts: Int!
        reconciliationNextAttemptAt: String
        reconciliationDeadLetterAt: String
        reconciliationLastError: String
      }

      type GroceryPlatformPayment {
        id: ID!
        amountCents: Int!
        status: String!
        providerPaymentId: String
        processedAt: String
        errorMessage: String
        providerCode: String!
        refunds: [GroceryPlatformPaymentRefund!]!
      }

      type GroceryPlatformSalesSummary {
        todayOrders: Int!
        todayGrossCents: Int!
        thirtyDayOrders: Int!
        thirtyDayGrossCents: Int!
        thirtyDayRefundCents: Int!
        thirtyDayNetCents: Int!
        averageBasketCents: Int!
      }

      type GroceryPlatformOrder {
        id: ID!
        displayId: Int!
        email: String!
        status: String!
        deliveryDate: String
        deliveryTimeWindow: String!
        createdAt: String
        currencyCode: String!
        subtotalCents: Int!
        taxCents: Int!
        deliveryFeeCents: Int!
        discountCents: Int!
        totalCents: Int!
        substitutionPreference: String
        metadata: JSON
        lineItems: [GroceryPlatformOrderLineItem!]!
        payments: [GroceryPlatformPayment!]!
      }

      type GroceryPlatformOrdersProjection {
        currencyCode: String!
        orders: [GroceryPlatformOrder!]!
        page: Int!
        pageSize: Int!
        totalOrders: Int!
        totalPages: Int!
        salesSummary: GroceryPlatformSalesSummary!
        pending: Int!
        picking: Int!
        packed: Int!
        outForDelivery: Int!
        delivered: Int!
      }

      type GroceryPlatformSubstitution {
        id: ID!
        orderItem: String!
        originalProduct: String!
        substitutedProduct: String!
        reason: String!
        customerApproved: Boolean!
        approvedAt: String
      }

      type GroceryPlatformFulfillmentProjection {
        pending: [GroceryPlatformOrder!]!
        picking: [GroceryPlatformOrder!]!
        packed: [GroceryPlatformOrder!]!
        orderItemSubstitutions: [GroceryPlatformSubstitution!]!
      }

      type GroceryPlatformDriver {
        id: ID!
        name: String!
        email: String!
      }

      type GroceryPlatformRouteOrder {
        id: ID!
        displayId: Int!
        status: String!
        metadata: JSON
      }

      type GroceryPlatformRoute {
        id: ID!
        date: String!
        timeWindow: String!
        status: String
        startedAt: String
        completedAt: String
        driver: GroceryPlatformDriver
        orders: [GroceryPlatformRouteOrder!]!
      }

      type GroceryPlatformDeliverySlot {
        id: ID!
        date: String!
        startTime: String!
        endTime: String!
        capacity: Int!
        currentBookings: Int!
        isActive: Boolean!
        deliveryFee: Int!
      }

      type GroceryPlatformDeliveryProjection {
        deliveryRoutes: [GroceryPlatformRoute!]!
        readyOrders: [GroceryPlatformOrder!]!
        drivers: [GroceryPlatformDriver!]!
        deliverySlots: [GroceryPlatformDeliverySlot!]!
      }

      type GroceryPlatformPickupSlot {
        id: ID!
        date: String!
        startTime: String!
        endTime: String!
        maxOrders: Int!
        currentOrders: Int!
        isAvailable: Boolean!
      }

      type GroceryPlatformParkingSpot {
        id: ID!
        spotNumber: String!
        description: String
        isAccessible: Boolean!
        isAvailable: Boolean!
      }

      type GroceryPlatformPickupOrder {
        id: ID!
        displayId: Int!
        email: String!
        status: String!
        metadata: JSON
      }

      type GroceryPlatformPickupProjection {
        pickupSlots: [GroceryPlatformPickupSlot!]!
        parkingSpots: [GroceryPlatformParkingSpot!]!
        pickupOrders: [GroceryPlatformPickupOrder!]!
      }

      type GroceryPlatformInventoryProduct {
        id: ID!
        title: String!
        sku: String!
        stockQuantity: Int
        recordedStockQuantity: Int!
        lowStockThreshold: Int
        inStock: Boolean!
        activeBackInStockAlerts: Int!
        department: String
        supplier: GroceryPlatformSupplier
      }

      type GroceryPlatformInventoryLot {
        id: ID!
        lotNumber: String!
        expirationDate: String!
        quantity: Int!
        quantityRemaining: Int!
        location: String
        isExpired: Boolean!
        isExpiringSoon: Boolean!
        product: GroceryPlatformInventoryProductRef
        supplier: GroceryPlatformSupplier
      }

      type GroceryPlatformInventoryProductRef { id: ID!, title: String! }
      type GroceryPlatformSupplier { id: ID!, name: String! }
      type GroceryPlatformInventoryProjection {
        products: [GroceryPlatformInventoryProduct!]!
        inventoryLots: [GroceryPlatformInventoryLot!]!
      }

      type GroceryPlatformSupplierRow {
        id: ID!
        name: String!
        contactName: String
        email: String!
        phone: String
        paymentTerms: String
        deliveryDays: JSON
        minimumOrder: Float
        minimumOrderCents: Int!
        products: [GroceryPlatformInventoryProductRef!]!
        purchaseOrders: [GroceryPlatformPurchaseOrderRef!]!
      }
      type GroceryPlatformPurchaseOrderRef { id: ID!, status: String }
      type GroceryPlatformSuppliersProjection { currencyCode: String!, suppliers: [GroceryPlatformSupplierRow!]! }

      type GroceryPlatformPurchaseOrder {
        id: ID!
        poNumber: String!
        orderDate: String!
        expectedDeliveryDate: String
        status: String
        totalAmount: Float
        totalAmountCents: Int
        notes: String
        isDueSoon: Boolean!
        supplier: GroceryPlatformSupplier
        items: [GroceryPlatformPurchaseItem!]!
      }
      type GroceryPlatformPurchaseItem { id: ID!, productTitle: String!, productSku: String!, quantity: Int!, quantityReceived: Int!, unitCost: Float!, unitCostCents: Int! }
      type GroceryPlatformPurchasingProjection { currencyCode: String!, purchaseOrders: [GroceryPlatformPurchaseOrder!]! }

      type GroceryPlatformDepartment {
        id: ID!
        name: String!
        handle: String!
        sortOrder: Int
        isActive: Boolean!
        temperatureZone: String
        products: [GroceryPlatformInventoryProductRef!]!
      }
      type GroceryPlatformCoupon {
        id: ID!
        code: String!
        discountType: String!
        discountValue: Float
        discountValueCents: Int!
        minPurchase: Float
        minPurchaseCents: Int!
        maxUses: Int!
        currentUses: Int!
        productCategories: JSON
        isActive: Boolean!
        validFrom: String
        validTo: String
      }
      type GroceryPlatformMerchandisingProjection {
        currencyCode: String!
        departments: [GroceryPlatformDepartment!]!
        coupons: [GroceryPlatformCoupon!]!
      }

      type GroceryPlatformCustomer {
        id: ID!
        name: String!
        email: String!
        onboardingStatus: String
        createdAt: String!
        orderCount: Int!
        shoppingListCount: Int!
        lastOrder: GroceryPlatformCustomerLastOrder
      }
      type GroceryPlatformCustomerLastOrder { displayId: Int!, status: String!, createdAt: String! }
      type GroceryPlatformCustomersProjection {
        users: [GroceryPlatformCustomer!]!
        totalCustomers: Int!
        savedCarts: Int!
      }

      type GroceryPlatformPaymentOrder { id: ID!, displayId: Int!, status: String! }
      type GroceryPlatformPaymentRow {
        id: ID!
        amountCents: Int!
        status: String!
        paymentMethod: String
        providerPaymentId: String
        providerCode: String!
        processedAt: String
        createdAt: String!
        errorMessage: String
        order: GroceryPlatformPaymentOrder!
        refunds: [GroceryPlatformPaymentRefund!]!
      }
      type GroceryPlatformPaymentProviderTruth {
        id: ID!
        name: String!
        code: String!
        isInstalled: Boolean!
        publicCheckout: Boolean!
        runtimeConfigured: Boolean!
      }
      type GroceryPlatformPaymentSummary {
        paymentCount: Int!
        failedCount: Int!
        processingCount: Int!
        capturedCents: Int!
        refundedCents: Int!
        netCents: Int!
        recovery: JSON!
      }
      type GroceryPlatformPaymentsProjection {
        currencyCode: String!
        payments: [GroceryPlatformPaymentRow!]!
        providers: [GroceryPlatformPaymentProviderTruth!]!
        summary: GroceryPlatformPaymentSummary!
      }

      type GroceryPlatformStoreTruth { id: ID!, name: String!, timezone: String!, currencyCode: String!, isActive: Boolean! }
      type GroceryPlatformSettingsTruth {
        id: ID!
        name: String!
        tagline: String!
        homepageTitle: String!
        homepageDescription: String!
        contactEmail: String!
        contactPhone: String!
        address: String!
        logoUrl: String!
        brandHue: Int
        currencyCode: String!
        taxRateBps: Int!
        locale: String!
        timezone: String!
        countryCode: String!
        hours: JSON!
        isActive: Boolean!
      }
      type GroceryPlatformSettingsCounts { products: Int!, suppliers: Int!, deliverySlots: Int!, pickupSlots: Int!, parkingSpots: Int! }
      type GroceryPlatformSettingsProjection { store: GroceryPlatformStoreTruth!, settings: GroceryPlatformSettingsTruth!, counts: GroceryPlatformSettingsCounts! }

      type Query {
        groceryPlatformOrders(page: Int, pageSize: Int): GroceryPlatformOrdersProjection!
        groceryPlatformFulfillment: GroceryPlatformFulfillmentProjection!
        groceryPlatformDelivery: GroceryPlatformDeliveryProjection!
        groceryPlatformPickup: GroceryPlatformPickupProjection!
        groceryPlatformInventory: GroceryPlatformInventoryProjection!
        groceryPlatformSuppliers: GroceryPlatformSuppliersProjection!
        groceryPlatformPurchasing: GroceryPlatformPurchasingProjection!
        groceryPlatformMerchandising: GroceryPlatformMerchandisingProjection!
        groceryPlatformCustomers: GroceryPlatformCustomersProjection!
        groceryPlatformPayments: GroceryPlatformPaymentsProjection!
        groceryPlatformSettings: GroceryPlatformSettingsProjection!
        redirectToInit: Boolean
        groceryCart(sessionId: String): GroceryCart
        clippedCoupons: [ClippedCoupon!]!
        activeCartPaymentProviders: [PaymentProvider!]!
        guestGroceryOrder(orderId: ID!, sessionId: String!, token: String!): Order
        publicGroceryCoupons: [PublicGroceryCoupon!]!
        publicGroceryStorefrontSettings: PublicGroceryStorefrontSettings!
        publicGroceryProducts(department: String, search: String, availability: String, organic: Boolean, sort: String, take: Int, skip: Int, ids: [ID!]): PublicGroceryProductConnection!
        publicGroceryProduct(handle: String!): PublicGroceryProduct
        publicGroceryAvailability(days: Int): PublicGroceryAvailability!
        groceryOutboxStatus: GroceryOutboxStatusResult!

        # Pickup Slot queries
        availablePickupSlots(days: Int, minCapacity: Int): [PickupSlotResult!]!
        pickupSlotsByDate(days: Int, minCapacity: Int): [PickupSlotsByDateResult!]!

        # Parking Spot queries
        availableParkingSpots(accessibleOnly: Boolean): [ParkingSpotResult!]!
      }

      type Mutation {
        updateActiveUser(data: UserUpdateProfileInput!): User
        provisionGroceryCustomer(name: String!, email: String!, temporaryPassword: String!): ProvisionGroceryCustomerResult!
        initiatePaymentSession(cartId: ID!, paymentProviderId: String!, deliverySlotId: ID, pickupSlotId: ID, sessionId: String, couponCode: String, recovery: CheckoutRecoveryInput!): PaymentSession
        addItemToGroceryCart(productId: ID!, quantity: Int!, sessionId: String): GroceryCart
        updateGroceryCartItem(itemId: ID!, quantity: Int!, sessionId: String): GroceryCart
        removeItemFromGroceryCart(itemId: ID!, sessionId: String): GroceryCart
        clearGroceryCart(sessionId: String): GroceryCart
        mergeGuestGroceryCart(guestSessionId: String!): GroceryCart
        updateGrocerySubstitutionPreference(itemId: ID!, preference: String!, sessionId: String): GroceryCart
        requestGroceryBackInStockAlert(productId: ID!): BackInStockRequestResult!

        # Shopping List mutations
        createCustomerShoppingList(name: String!): ShoppingList!
        deleteCustomerShoppingList(listId: ID!): DeleteShoppingListResult!
        addToShoppingList(listId: ID!, product: String!, quantity: Int, unit: String, notes: String): ShoppingListResult!
        removeFromShoppingList(listId: ID!, itemId: ID!): ShoppingListResult!
        updateShoppingListItemQuantity(listId: ID!, itemId: ID!, quantity: Int!): ShoppingListResult!
        toggleShoppingListItemChecked(listId: ID!, itemId: ID!): ShoppingListResult!
        addShoppingListToCart(listId: ID!, sessionId: String): AddListToCartResult!

        # Customer Check-in mutations
        customerCheckIn(orderId: ID!, parkingSpotId: ID, vehicleDescription: String): CustomerCheckInResult!
        guestCustomerCheckIn(orderId: ID!, sessionId: String!, token: String!, parkingSpotId: ID, vehicleDescription: String): CustomerCheckInResult!
        releaseParkingSpot(parkingSpotId: ID!, orderId: ID!): ReleaseParkingSpotResult!
        completeOrderHandoff(orderId: ID!): CompleteOrderHandoffResult!
        createDeliveryRouteFromOrders(deliveryDate: String!, deliveryTimeWindow: String!, orderIds: [ID!]!, driverId: ID!): DeliveryRouteWorkflowResult!
        updateDeliveryRouteWorkflow(routeId: ID!, status: String!): DeliveryRouteWorkflowResult!
        submitGroceryOrder(data: SubmitGroceryOrderInput!): SubmitGroceryOrderResult!
        cancelGroceryOrder(orderId: ID!, reason: String!, idempotencyKey: String!): OrderCancellationResult!
        reconcileCheckoutAttempts(limit: Int): CheckoutReconciliationResult!
        reconcilePaymentRefunds(limit: Int): RefundReconciliationResult!
        updateSupplierMinimumOrder(supplierId: ID!, minimumOrderCents: Int!): SupplierMinimumOrderResult!
        handlePaymentProviderWebhook(providerCode: String!, rawBody: String!, headers: JSON): PaymentWebhookResult!
        refundPayment(paymentId: ID!, amountCents: Int!, reason: String!, idempotencyKey: String!): PaymentRefundResult!
        runGroceryOnboarding(seed: JSON): GroceryOnboardingResult!
        updateGroceryStorefrontBrandHue(brandHue: Int): StorefrontBrandHueResult!
        advanceOrderFulfillment(orderId: ID!, target: String!): OrderFulfillmentWorkflowResult!
        recordOrderItemSubstitution(orderItemId: ID!, substitutedProduct: String!, reason: String, customerApproved: Boolean, idempotencyKey: String!): OrderItemSubstitutionWorkflowResult!
        claimGroceryOutboxEvents(workerId: String!, limit: Int): [GroceryOutboxEventResult!]!
        completeGroceryOutboxEvent(eventId: ID!, claimToken: String!, succeeded: Boolean!, error: String): GroceryOutboxEventResult!
        replayGroceryOutboxEvent(eventId: ID!): GroceryOutboxEventResult!
        configureDeliverySlot(slotId: ID!, capacity: Int, deliveryFee: Int, isActive: Boolean, idempotencyKey: String!): StoreCapacityResult!
        configurePickupSlot(slotId: ID!, maxOrders: Int, isAvailable: Boolean, idempotencyKey: String!): StoreCapacityResult!
        configureParkingSpot(spotId: ID!, isAvailable: Boolean!, idempotencyKey: String!): StoreCapacityResult!
        adjustInventoryLot(inventoryLotId: ID!, targetQuantityRemaining: Int!, reason: String!, idempotencyKey: String!, note: String): InventoryAdjustmentResult!
        createPurchaseOrderDraft(idempotencyKey: String!, supplierId: ID!, expectedDeliveryDate: String, notes: String, items: [PurchaseOrderDraftItemInput!]!): PurchaseOrderDraftResult!
        removePurchaseOrderDraftItem(purchaseOrderId: ID!, poItemId: ID!): PurchaseOrderDraftItemRemovalResult!
        transitionPurchaseOrder(purchaseOrderId: ID!, status: String!): PurchaseOrderWorkflowResult!
        receivePurchaseOrder(purchaseOrderId: ID!, receipts: [PurchaseOrderReceiptInput!]!): PurchaseOrderWorkflowResult!
      }

      input SubmitGroceryOrderAddressInput {
        firstName: String!
        lastName: String!
        address1: String!
        city: String!
        province: String!
        postalCode: String!
        phone: String!
      }

      input CheckoutRecoveryInput {
        email: String!
        deliveryAddress: SubmitGroceryOrderAddressInput!
        substitutionPreference: String!
        deliveryInstructions: String
      }

      input SubmitGroceryOrderInput {
        cartId: ID!
        paymentSessionId: ID!
        paymentIntentId: String!
        sessionId: String
        couponCode: String
        email: String!
        deliveryAddress: SubmitGroceryOrderAddressInput!
        deliveryDate: String!
        deliveryTimeWindow: String!
        fulfillmentMethod: String!
        deliverySlotId: ID
        pickupSlotId: ID
        deliveryFee: Float!
        expectedTotal: Float!
        substitutionPreference: String!
        deliveryInstructions: String
      }

      type SubmitGroceryOrderResult {
        success: Boolean!
        orderId: ID
        displayId: Int
        guestOrderToken: String
        message: String!
      }
    `,
    resolvers: {
      JSON: JSONScalar,
      Query: {
        groceryPlatformOrders,
        groceryPlatformFulfillment,
        groceryPlatformDelivery,
        groceryPlatformPickup,
        groceryPlatformInventory,
        groceryPlatformSuppliers,
        groceryPlatformPurchasing,
        groceryPlatformMerchandising,
        groceryPlatformCustomers,
        groceryPlatformPayments,
        groceryPlatformSettings,
        redirectToInit,
        groceryCart: getCart,
        clippedCoupons: getClippedCoupons,
        activeCartPaymentProviders: async (_root: unknown, _args: unknown, context: any) => {
          return context.sudo().query.PaymentProvider.findMany({
            where: {
              code: { equals: STRIPE_PROVIDER_CODE },
              isInstalled: { equals: true },
            },
            query: 'id name code isInstalled',
          });
        },
        guestGroceryOrder: getGuestGroceryOrder,
        publicGroceryCoupons: getPublicGroceryCoupons,
        publicGroceryStorefrontSettings: getPublicGroceryStorefrontSettings,
        publicGroceryProducts: getPublicGroceryProducts,
        publicGroceryProduct: getPublicGroceryProduct,
        publicGroceryAvailability: getPublicGroceryAvailability,
        groceryOutboxStatus,
        availablePickupSlots: getAvailablePickupSlots,
        pickupSlotsByDate: getPickupSlotsByDate,
        availableParkingSpots: getAvailableParkingSpots,
      },
      Mutation: {
        updateActiveUser,
        provisionGroceryCustomer,
        initiatePaymentSession,
        addItemToGroceryCart: addToCart,
        updateGroceryCartItem: updateCartItem,
        removeItemFromGroceryCart: removeFromCart,
        clearGroceryCart: clearCart,
        mergeGuestGroceryCart: mergeGuestCart,
        updateGrocerySubstitutionPreference: updateSubstitutionPreference,
        requestGroceryBackInStockAlert,

        // Recipe mutations

        // Shopping List mutations
        createCustomerShoppingList: createShoppingList,
        deleteCustomerShoppingList: deleteShoppingList,
        addToShoppingList: addToList,
        removeFromShoppingList: removeFromList,
        updateShoppingListItemQuantity: updateListItemQuantity,
        toggleShoppingListItemChecked: toggleListItemChecked,
        addShoppingListToCart: addListToCart,

        // Customer Check-in mutations
        customerCheckIn,
        guestCustomerCheckIn,
        releaseParkingSpot,
        completeOrderHandoff,
        createDeliveryRouteFromOrders,
        updateDeliveryRouteWorkflow,
        submitGroceryOrder,
        cancelGroceryOrder,
        reconcileCheckoutAttempts,
        reconcilePaymentRefunds,
        updateSupplierMinimumOrder,
        handlePaymentProviderWebhook,
        refundPayment: refundPaymentForOrder,
        runGroceryOnboarding,
        updateGroceryStorefrontBrandHue,
        advanceOrderFulfillment,
        recordOrderItemSubstitution,
        claimGroceryOutboxEvents,
        completeGroceryOutboxEvent,
        replayGroceryOutboxEvent,
        configureDeliverySlot,
        configurePickupSlot,
        configureParkingSpot,
        adjustInventoryLot,
        createPurchaseOrderDraft,
        removePurchaseOrderDraftItem,
        transitionPurchaseOrder,
        receivePurchaseOrder,
      },
    },
  });
}
