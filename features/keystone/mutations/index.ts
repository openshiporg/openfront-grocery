import { convertInventoryCases } from "./convertInventoryCases";
import recoverGroceryPaymentCreation from './recoverGroceryPaymentCreation';
import { rescheduleReturnedGroceryDelivery, groceryDeliveryRescheduleSlots } from "./rescheduleReturnedGroceryDelivery";
import { groceryRecurringOverview } from "./groceryRecurringOverview";
import { groceryPaymentWebhookRecovery } from "./groceryPaymentWebhookRecovery";
import { importGroceryCatalog } from "./importGroceryCatalog";
import { replayPaymentWebhookEvent } from "./handlePaymentProviderWebhook";
import { reviewGroceryCustomerErasure } from "./manageCustomerPrivacy";
import { exportGroceryCustomerData } from "./manageCustomerPrivacy";
import { requestGroceryCustomerPrivacy } from "./manageCustomerPrivacy";
import { groceryCustomerPrivacy } from "./manageCustomerPrivacy";
import { revokeGroceryStaffInvitation } from "./manageGroceryStaff";
import { updateGroceryStaffAccess } from "./manageGroceryStaff";
import { acceptGroceryStaffInvitation } from "./manageGroceryStaff";
import { inviteGroceryStaff } from "./manageGroceryStaff";
import { groceryStaffDirectory } from "./manageGroceryStaff";
import { voidGroceryPaymentAuthorization } from "./voidGroceryPaymentAuthorization";
import { getGroceryOrderRefundLines } from "./refundGroceryOrderLines";
import { refundGroceryOrderLines } from "./refundGroceryOrderLines";
import { updateGroceryNotificationPreferences } from "./updateGroceryNotificationPreferences";
import { getGroceryLoyalty } from "./manageGroceryLoyalty";
import { groceryFinancialCloseExport } from "./groceryFinancialClose";
import { groceryFinancialCloses } from "./groceryFinancialClose";
import { processDueGrocerySubscriptions } from "./manageGrocerySubscriptions";
import { manageGrocerySubscription } from "./manageGrocerySubscriptions";
import { redeemGroceryLoyalty } from "./manageGroceryLoyalty";
import { configureGroceryLoyalty } from "./manageGroceryLoyalty";
import { resolveGrocerySettlementMatch } from "./groceryFinancialClose";
import { importGrocerySettlementStatement } from "./groceryFinancialClose";
import { createGroceryFinancialClose } from "./groceryFinancialClose";
import { manageSupplierSettlement } from "./manageSupplierSettlement";
import { resolveDeliveryStop } from "./manageDeliveryRoutes";
import { updateProductInformation } from "./updateProductInformation";
import { authorizeOrderAdjustment } from "./authorizeOrderAdjustment";
import { requestGuestOrderAccess } from "./requestGuestOrderAccess";
import { resumeGroceryCheckout } from "./resumeGroceryCheckout";
import restartGroceryCheckout from './restartGroceryCheckout';
import { updateGroceryDeliveryPolicy } from "./updateGroceryDeliveryPolicy";
import { manageInventoryCount } from "./manageInventoryCounts";
import { manageInventorySafety } from "./manageInventorySafety";
import { finalizeGroceryOrderActuals } from "./finalizeGroceryOrderActuals";
import { resolveOrderLineFulfillment } from "./resolveOrderLineFulfillment";
import { mergeSchemas } from "@graphql-tools/schema";
import { GraphQLScalarType, Kind, type GraphQLSchema, type ValueNode } from 'graphql';
import redirectToInit from "./redirectToInit";
import updateActiveUser from "./updateActiveUser";
import updateActiveUserPassword from "./updateActiveUserPassword";
import { recoverRevisedAuthorization } from "./recoverRevisedAuthorization";
import { updateGroceryStoreProfile } from "./updateGroceryStoreProfile";
import { getCustomerOrderSubstitutions } from "./getCustomerOrderSubstitutions";
import {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
  mergeGuestCart,
  reorderGroceryOrder,
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
import { updateGroceryStoreLogo } from './updateGroceryStoreLogo';
import {
  getPublicGroceryStorefrontSettings,
  updateGroceryStorefrontBrandHue,
} from './getPublicGroceryStorefrontSettings';
import {
  getPublicGroceryProduct,
  getPublicGroceryProducts,
  requestGroceryBackInStockAlert,
  requestGroceryPriceAlert,
} from './getPublicGroceryCatalog';
import { assertPublicPaymentProvider } from '../../integrations/payment';
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
import { proposeOrderLineSubstitution, respondToOrderLineSubstitution } from './manageSubstitutionProposals';
import { submitGroceryContactMessage } from './submitGroceryContactMessage';
import { registerGroceryCustomer } from './registerGroceryCustomer';
import { saveFavoriteProduct } from './saveFavoriteProduct';
import { refundPaymentForOrder } from './managePaymentRefund';
import {
  claimGroceryOutboxEvents,
  completeGroceryOutboxEvent,
  groceryOutboxStatus,
  replayGroceryOutboxEvent,
  reconcileGroceryCustomerDelivery,
} from './manageGroceryOutbox';
import { deliverGroceryOutboxNow } from './deliverGroceryEvents';
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
  groceryPurchasingOptions,
  groceryPlatformMerchandising,
  groceryPlatformCustomers,
  groceryPlatformCustomer,
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
        currentPassword: String
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
        stockQuantity: Float
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
        stockQuantity: Float
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
        replayed: Boolean!
      }

      type PublicGroceryStorefrontSettings {
        id: ID!
        name: String
        setupIncomplete: Boolean!
        tagline: String
        homepageTitle: String
        homepageDescription: String
        contactEmail: String
        contactPhone: String
        address: String
        logoUrl: String
        logoIcon: String
        logoColor: String!
        brandHue: Int
        effectiveBrandHue: Int!
        currencyCode: String
        locale: String
        timezone: String
        countryCode: String
        openingHours: JSON!
        policyNotes: String
      }

      input GroceryContactMessageInput {
        name: String!
        email: String!
        phone: String
        topic: String!
        orderNumber: String
        message: String!
        sourcePath: String
      }

      type GroceryContactMessageReceipt {
        reference: String!
        receivedAt: String!
      }

      type GroceryStoreLogoResult {
        logoIcon: String
        logoColor: String!
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
        nutrition: JSON
        variantLabel: String
        variantOf: JSON
        packBaseUnitsMilli: Int
        informationSource: String
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
        stockQuantity: Float!
        backInStockRequested: Boolean!
      }

      type PublicGroceryProductConnection {
        products: [PublicGroceryProduct!]!
        totalCount: Int!
      }

      type CustomerOrderSubstitution {
        id: ID!
        orderItem: ID!
        originalProduct: String
        substitutedProduct: String
        reason: String
        customerApproved: Boolean
        approvedAt: String
      }

      input GroceryStoreHoursInput {
        monday: String
        tuesday: String
        wednesday: String
        thursday: String
        friday: String
        saturday: String
        sunday: String
      }

      input GroceryStoreProfileInput {
        name: String
        tagline: String
        homepageTitle: String
        homepageDescription: String
        contactEmail: String
        contactPhone: String
        address: String
        countryCode: String
        locale: String
        timezone: String
        taxRateBps: Int
        policyNotes: String
        hours: GroceryStoreHoursInput
      }

      type GroceryStoreProfileResult {
        success: Boolean!
      }

      type RevisedAuthorizationRecovery {
        recovered: Boolean!
        alreadyRecorded: Boolean!
        paymentIntentId: String
      }

      type PriceAlertRequestResult {
        requested: Boolean!
        emailDisabled: Boolean!
        message: String!
      }

      type BackInStockRequestResult {
        requested: Boolean!
        reused: Boolean!
        productId: ID!
        emailDisabled: Boolean!
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
        excludedProductNames: [String!]!
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
      type RegisterGroceryCustomerResult { success: Boolean!, customerId: ID!, email: String! }
      type SaveFavoriteProductResult { id: ID!, productId: ID!, reused: Boolean! }
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
        unknown: Int!
        reconciled: Int!
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
        quantityDelta: Float!
        quantityRemaining: Float!
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
        receiptKey: String
        deliveryReference: String
        conditionStatus: String
        inspectionNote: String
        poItemId: ID!
        targetQuantityReceived: Float!
        lotNumber: String!
        expirationDate: String!
        location: String
      }

      type PurchaseOrderWorkflowResult {
        success: Boolean!
        purchaseOrderId: ID!
        status: String!
        receivedUnits: Float!
        message: String!
      }

      scalar JSON

      type GroceryOnboardingResult {
        completed: Boolean!
        reused: Boolean!
        missing: [String!]!
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
        product: JSON
        fulfillment: JSON
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
        timezone: String!
        view: String!
        viewCounts: JSON!
        actorCanRefund: Boolean!
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

      type GroceryPlatformFulfillmentProjection { pagination: JSON!
        timezone: String!
        view: String!
        summary: JSON!
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
        stops: JSON
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

      type GroceryPlatformDeliveryProjection { pagination: JSON!
        timezone: String!
        routeView: String!
        routeViewCounts: JSON!
        slotView: String!
        slotSort: String!
        readyPagination: JSON!
        slotPagination: JSON!
        summary: JSON!
        deliveryRoutes: [GroceryPlatformRoute!]!
        readyOrders: [GroceryPlatformOrder!]!
        drivers: [GroceryPlatformDriver!]!
        driversTruncated: Boolean!
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

      type GroceryPlatformPickupProjection { pagination: JSON!
        slotView: String!
        slotSort: String!
        stagedPagination: JSON!
        slotPagination: JSON!
        summary: JSON!
        pickupSlots: [GroceryPlatformPickupSlot!]!
        parkingSpots: [GroceryPlatformParkingSpot!]!
        occupiedSpotIds: [ID!]!
        arrivals: [GroceryPlatformPickupOrder!]!
        stagedOrders: [GroceryPlatformPickupOrder!]!
      }

      type GroceryPlatformInventoryProduct {
        id: ID!
        title: String!
        sku: String!
        stockQuantity: Float
        recordedStockQuantity: Float!
        lowStockThreshold: Int
        inStock: Boolean!
        activeBackInStockAlerts: Int!
        department: String
        unitOfMeasure: String
        supplier: GroceryPlatformSupplier
      }

      type GroceryPlatformInventoryLot {
        safetyStatus: String
        conditionStatus: String
        id: ID!
        lotNumber: String!
        expirationDate: String!
        quantity: Float!
        quantityRemaining: Float!
        location: String
        isExpired: Boolean!
        isExpiringSoon: Boolean!
        product: GroceryPlatformInventoryProductRef
        supplier: GroceryPlatformSupplier
      }

      type GroceryPlatformInventoryProductRef { id: ID!, title: String!, unitOfMeasure: String }
      type GroceryPlatformSupplier { id: ID!, name: String! }
      type GroceryPlatformInventoryProjection { pagination: JSON!
        products: [GroceryPlatformInventoryProduct!]!
        inventoryLots: [GroceryPlatformInventoryLot!]!
        lotViewCounts: JSON!
      }

      type GroceryPlatformSupplierRow {
        productCount: Int!
        purchaseOrderCount: Int!
        openPurchaseOrderCount: Int!
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
      type GroceryPlatformSuppliersProjection { pagination: JSON!  currencyCode: String!, suppliers: [GroceryPlatformSupplierRow!]!, viewCounts: JSON!, openPurchaseOrders: Int! }

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
      type GroceryPlatformPurchaseItem { id: ID!, productTitle: String!, productSku: String!, quantity: Float!, quantityReceived: Float!, unitCost: Float!, unitCostCents: Int! }
      type GroceryPlatformPurchasingProjection { pagination: JSON!  currencyCode: String!, statusCounts: JSON!, dueSoonCount: Int!, openCommittedCents: Int!, purchaseOrders: [GroceryPlatformPurchaseOrder!]! }
      type GroceryPurchasingOption { id: ID!, name: String, title: String }

      type GroceryPlatformDepartment {
        productCount: Int!
        id: ID!
        name: String!
        handle: String!
        sortOrder: Int
        isActive: Boolean!
        temperatureZone: String
        description: String
        imageUrl: String
        requiredLicenses: [String!]!
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
        productCategories: [String!]
        categoryRestrictionValid: Boolean!
        isActive: Boolean!
        validFrom: String
        validTo: String
      }
      type GroceryPlatformMerchandisingProjection { pagination: JSON!
        currencyCode: String!
        viewCounts: JSON!
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
      type GroceryPlatformCustomerOrder { id: ID!, displayId: Int!, status: String!, totalCents: Int!, currencyCode: String!, createdAt: String }
      type GroceryPlatformCustomerDetail {
        id: ID!
        name: String!
        email: String!
        createdAt: String
        privacyErasedAt: String
        orderCount: Int!
        shoppingListCount: Int!
        addressCount: Int!
        recentOrders: [GroceryPlatformCustomerOrder!]!
      }

      type GroceryPlatformCustomersProjection { pagination: JSON!
        users: [GroceryPlatformCustomer!]!
        totalCustomers: Int!
        allCustomers: Int!
        customersWithOrders: Int!
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
        voidable: Boolean!
        awaitingRevisedAuthorization: Boolean!
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
        attentionCount: Int!
        paymentCount: Int!
        failedCount: Int!
        processingCount: Int!
        capturedCents: Int!
        refundedCents: Int!
        netCents: Int!
        recovery: JSON!
      }
      type GroceryPlatformPaymentsProjection { pagination: JSON!
        currencyCode: String!
        payments: [GroceryPlatformPaymentRow!]!
        providers: [GroceryPlatformPaymentProviderTruth!]!
        providerConfiguration: String!
        providerConfigurationEditable: Boolean!
        summary: GroceryPlatformPaymentSummary!
        viewCounts: JSON!
        actorCanManageOrders: Boolean!
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
        policyNotes: String
        logoUrl: String!
        logoIcon: String
        logoColor: String!
        brandHue: Int
        currencyCode: String!
        taxRateBps: Int!
        locale: String!
        timezone: String!
        countryCode: String!
        hours: JSON!
        deliveryPolicy: JSON
        isActive: Boolean!
      }
      type GroceryPlatformSettingsCounts { products: Int!, suppliers: Int!, deliverySlots: Int!, pickupSlots: Int!, parkingSpots: Int! }
      type GroceryPlatformSettingsProjection { store: GroceryPlatformStoreTruth!, settings: GroceryPlatformSettingsTruth!, counts: GroceryPlatformSettingsCounts! }

      type Query {
        groceryDeliveryRescheduleSlots(orderId: ID!): JSON!
        groceryRecurringOverview(page: Int, customerOnly: Boolean, search: String, outcome: String, schedule: String): JSON!
        groceryPaymentWebhookRecovery(page: Int): JSON!
        groceryCustomerPrivacy(page: Int, pageSize: Int): JSON!
        groceryStaffDirectory(page: Int, pageSize: Int, search: String, access: String): JSON!
        getGroceryOrderRefundLines(orderId: ID!): JSON!
        getGroceryLoyalty: JSON!
        groceryFinancialCloseExport(closeId: ID!): JSON!
        groceryFinancialCloses(page: Int, pageSize: Int): JSON!
        groceryPlatformOrders(page: Int, pageSize: Int, search: String, view: String, sort: String, orderId: ID): GroceryPlatformOrdersProjection!
        groceryPlatformFulfillment(page: Int, pageSize: Int, search: String, status: String, view: String, sort: String): GroceryPlatformFulfillmentProjection!
        groceryPlatformDelivery(page: Int, pageSize: Int, search: String, status: String, routeView: String, routePage: Int, readyPage: Int, slotPage: Int, slotView: String, slotSort: String): GroceryPlatformDeliveryProjection!
        groceryPlatformPickup(page: Int, pageSize: Int, search: String, status: String, arrivalPage: Int, stagedPage: Int, slotPage: Int, slotView: String, slotSort: String): GroceryPlatformPickupProjection!
        groceryPlatformInventory(page: Int, pageSize: Int, search: String, status: String, view: String, sort: String): GroceryPlatformInventoryProjection!
        groceryPlatformSuppliers(page: Int, pageSize: Int, search: String, status: String, view: String, sort: String): GroceryPlatformSuppliersProjection!
        groceryPlatformPurchasing(page: Int, pageSize: Int, search: String, status: String, view: String, sort: String, supplierId: ID): GroceryPlatformPurchasingProjection!
        groceryPurchasingOptions(kind: String!, search: String!): [GroceryPurchasingOption!]!
        groceryPlatformMerchandising(page: Int, pageSize: Int, search: String, status: String, view: String, sort: String): GroceryPlatformMerchandisingProjection!
        groceryPlatformCustomers(page: Int, pageSize: Int, search: String, status: String, view: String, sort: String): GroceryPlatformCustomersProjection!
        groceryPlatformCustomer(id: ID!): GroceryPlatformCustomerDetail
        groceryPlatformPayments(page: Int, pageSize: Int, search: String, status: String, view: String, sort: String): GroceryPlatformPaymentsProjection!
        groceryPlatformSettings: GroceryPlatformSettingsProjection!
        redirectToInit: Boolean
        groceryCart(sessionId: String): GroceryCart
        customerOrderSubstitutions(orderId: ID!): [CustomerOrderSubstitution!]!
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

      type GroceryVoidResult { success: Boolean!, paymentId: ID!, status: String!, reused: Boolean! }
      type GroceryLineRefundResult { success: Boolean!, status: String!, paymentRefundId: ID, amountCents: Int!, allocations: JSON!, reused: Boolean!, message: String! }
      type GroceryLoyaltyConfigurationResult { success: Boolean!, programId: ID! }
      type GroceryLoyaltyRedemptionResult { success: Boolean!, redemptionId: ID!, couponCode: String!, points: Int!, discountCents: Int!, balance: Int!, reused: Boolean! }
      type GrocerySubscriptionResult { success: Boolean!, subscriptionId: ID!, status: String!, runId: ID, reused: Boolean! }
      type GrocerySubscriptionProcessingResult { processed: Int!, results: JSON! }
      type GroceryFulfillmentActualResult { success: Boolean! fulfillmentId: ID! lineItemId: ID! resolution: String! quantityMilli: Int! subtotalCents: Int! reused: Boolean! }

      type Mutation {
        recoverGroceryPaymentCreation(paymentSessionId: ID!, providerPaymentId: String!, reason: String!): JSON!
        convertInventoryCases(mode: String!, sourceInventoryLotId: ID!, quantityCases: Int!, reason: String!, conditionNote: String!, destinationLocation: String, idempotencyKey: String!, expectedReviewHash: String): JSON!
        rescheduleReturnedGroceryDelivery(orderId: ID!, deliverySlotId: ID!, customerApproval: String!, conditionEvidence: String!, idempotencyKey: String!): JSON!
        importGroceryCatalog(mode: String!, schemaVersion: Int!, sourceSystem: String!, sourceBatchId: String!, idempotencyKey: String!, csv: String!, expectedPayloadHash: String, expectedReviewHash: String): JSON!
        replayPaymentWebhookEvent(eventId: ID!, reason: String!): JSON!
        exportGroceryCustomerData(requestId: ID!, afterOrderId: ID, collection: String, afterId: ID): JSON!
        reviewGroceryCustomerErasure(requestId: ID!, approve: Boolean!, reason: String!): JSON!
        requestGroceryCustomerPrivacy(kind: String!): JSON!
        revokeGroceryStaffInvitation(invitationId: ID!, reason: String!): JSON!
        updateGroceryStaffAccess(userId: ID!, capabilities: JSON!, reason: String!): JSON!
        acceptGroceryStaffInvitation(token: String!, password: String!): JSON!
        inviteGroceryStaff(name: String!, email: String!, capabilities: JSON!, delivery: String): JSON!
        voidGroceryPaymentAuthorization(paymentId: ID!, reason: String!, idempotencyKey: String!): GroceryVoidResult!
        refundGroceryOrderLines(orderId: ID!, paymentId: ID!, idempotencyKey: String!, reason: String!, lines: JSON!): GroceryLineRefundResult!
        updateGroceryNotificationPreferences(orderUpdates: Boolean!, deliveryAlerts: Boolean!, backInStock: Boolean!, emailEnabled: Boolean): Boolean!
        processDueGrocerySubscriptions(limit: Int): GrocerySubscriptionProcessingResult!
        manageGrocerySubscription(action: String!, subscriptionId: ID, productId: ID, quantity: Int, frequency: String, firstRunAt: String, pausedUntil: String, idempotencyKey: String!, approveEachOrder: Boolean): GrocerySubscriptionResult!
        redeemGroceryLoyalty(points: Int!, idempotencyKey: String!): GroceryLoyaltyRedemptionResult!
        configureGroceryLoyalty(name: String!, earnPointsPer100Cents: Int!, redeemPointsPer100Cents: Int!, minimumRedemptionPoints: Int!, isActive: Boolean!): GroceryLoyaltyConfigurationResult!
        resolveGrocerySettlementMatch(matchId: ID!, reason: String!, idempotencyKey: String!): JSON!
        importGrocerySettlementStatement(providerCode: String!, statementReference: String!, csv: String!, idempotencyKey: String!): JSON!
        createGroceryFinancialClose(startDate: String!, endDate: String!, timezone: String!, idempotencyKey: String!, note: String): JSON!
        manageSupplierSettlement(action: String!, idempotencyKey: String!, invoiceId: ID, creditId: ID, input: JSON!): JSON!
        resolveDeliveryStop(routeId: ID!, orderId: ID!, status: String!, recipient: String, proofReference: String, reason: String, custody: String!, conditionEvidence: String!, retryAt: String, retryLocalTime: String, idempotencyKey: String!, approvalEvidence: String): JSON!
        updateProductInformation(productId: ID!, input: JSON!, idempotencyKey: String!): JSON!
        authorizeOrderAdjustment(orderId: ID!, sessionId: String, token: String): JSON!
        respondToOrderLineSubstitution(orderId: ID!, lineItemId: ID!, proposalId: String!, decision: String!, sessionId: String, token: String): JSON!
        requestGuestOrderAccess(orderId: ID!, email: String!): Boolean!
        submitGroceryContactMessage(data: GroceryContactMessageInput!): GroceryContactMessageReceipt!
        registerGroceryCustomer(name: String!, email: String!, password: String!): RegisterGroceryCustomerResult!
        saveFavoriteProduct(productId: ID!): SaveFavoriteProductResult!
        resumeGroceryCheckout(paymentSessionId: ID!, sessionId: String): SubmitGroceryOrderResult!
        restartGroceryCheckout(paymentSessionId: ID!, sessionId: String): PaymentSession
        updateGroceryDeliveryPolicy(policy: JSON!): JSON!
        manageInventoryCount(action: String!, inventoryLotId: ID, countId: ID, quantity: Float, reason: String!, idempotencyKey: String!): JSON!
        manageInventorySafety(action: String!, inventoryLotIds: [ID!], productId: ID, recallId: ID, reason: String!, idempotencyKey: String!, evidence: JSON): JSON!
        finalizeGroceryOrderActuals(orderId: ID!): JSON!
        resolveOrderLineFulfillment(orderId: ID!, lineItemId: ID!, resolution: String!, productId: ID, quantity: String!, tare: String, unitOfMeasure: String!, reason: String, consentChannel: String, consentCustomer: String, consentEvidence: String, idempotencyKey: String!): GroceryFulfillmentActualResult!
        updateActiveUser(data: UserUpdateProfileInput!): User
        updateActiveUserPassword(currentPassword: String!, newPassword: String!): Boolean!
        recoverRevisedAuthorization(orderId: ID!, providerPaymentId: String!, reason: String!): RevisedAuthorizationRecovery!
        updateGroceryStoreProfile(input: GroceryStoreProfileInput!): GroceryStoreProfileResult!
        provisionGroceryCustomer(name: String!, email: String!, temporaryPassword: String!): ProvisionGroceryCustomerResult!
        initiatePaymentSession(cartId: ID!, paymentProviderId: String!, deliverySlotId: ID, pickupSlotId: ID, sessionId: String, couponCode: String, recovery: CheckoutRecoveryInput!): PaymentSession
        addItemToGroceryCart(productId: ID!, quantity: Int!, sessionId: String): GroceryCart
        updateGroceryCartItem(itemId: ID!, quantity: Int!, sessionId: String): GroceryCart
        removeItemFromGroceryCart(itemId: ID!, sessionId: String): GroceryCart
        clearGroceryCart(sessionId: String): GroceryCart
        mergeGuestGroceryCart(guestSessionId: String!): GroceryCart
        updateGrocerySubstitutionPreference(itemId: ID!, preference: String!, sessionId: String): GroceryCart
        requestGroceryBackInStockAlert(productId: ID!, enableEmail: Boolean): BackInStockRequestResult!
        requestGroceryPriceAlert(productId: ID!, targetPrice: String!, enableEmail: Boolean): PriceAlertRequestResult!

        # Shopping List mutations
        createCustomerShoppingList(name: String!): ShoppingList!
        deleteCustomerShoppingList(listId: ID!): DeleteShoppingListResult!
        addToShoppingList(listId: ID!, product: String, productId: ID, quantity: Int, unit: String, notes: String, mode: String): ShoppingListResult!
        removeFromShoppingList(listId: ID!, itemId: ID!): ShoppingListResult!
        updateShoppingListItemQuantity(listId: ID!, itemId: ID!, quantity: Int!, expectedQuantity: Int): ShoppingListResult!
        toggleShoppingListItemChecked(listId: ID!, itemId: ID!): ShoppingListResult!
        addShoppingListToCart(listId: ID!, sessionId: String, requestKey: String): AddListToCartResult!
        reorderGroceryOrder(orderId: ID!, requestKey: String!, sessionId: String): AddListToCartResult!

        # Customer Check-in mutations
        customerCheckIn(orderId: ID!, parkingSpotId: ID, vehicleDescription: String): CustomerCheckInResult!
        guestCustomerCheckIn(orderId: ID!, sessionId: String!, token: String!, parkingSpotId: ID, vehicleDescription: String): CustomerCheckInResult!
        releaseParkingSpot(parkingSpotId: ID!, orderId: ID!): ReleaseParkingSpotResult!
        completeOrderHandoff(orderId: ID!): CompleteOrderHandoffResult!
        createDeliveryRouteFromOrders(deliveryDate: String!, deliveryTimeWindow: String!, orderIds: [ID!]!, driverId: ID!): DeliveryRouteWorkflowResult!
        updateDeliveryRouteWorkflow(routeId: ID!, status: String!): DeliveryRouteWorkflowResult!
        submitGroceryOrder(data: SubmitGroceryOrderInput!): SubmitGroceryOrderResult!
        cancelGroceryOrder(orderId: ID!, reason: String!, idempotencyKey: String!, disposition: String, conditionNote: String): OrderCancellationResult!
        reconcileCheckoutAttempts(limit: Int): CheckoutReconciliationResult!
        reconcilePaymentRefunds(limit: Int): RefundReconciliationResult!
        updateSupplierMinimumOrder(supplierId: ID!, minimumOrderCents: Int!): SupplierMinimumOrderResult!
        handlePaymentProviderWebhook(providerCode: String!, rawBody: String!, headers: JSON): PaymentWebhookResult!
        refundPayment(paymentId: ID!, amountCents: Int!, reason: String!, idempotencyKey: String!): PaymentRefundResult!
        runGroceryOnboarding(seed: JSON): GroceryOnboardingResult!
        updateGroceryStoreLogo(logoIcon: String, logoColor: String!): GroceryStoreLogoResult!
        updateGroceryStorefrontBrandHue(brandHue: Int): StorefrontBrandHueResult!
        advanceOrderFulfillment(orderId: ID!, target: String!): OrderFulfillmentWorkflowResult!
        recordOrderItemSubstitution(orderItemId: ID!, substitutedProduct: String!, reason: String, customerApproved: Boolean, idempotencyKey: String!): OrderItemSubstitutionWorkflowResult!
        proposeOrderLineSubstitution(orderId: ID!, lineItemId: ID!, productId: ID!, quantity: String!, unitOfMeasure: String!, reason: String!, idempotencyKey: String!): JSON!
        claimGroceryOutboxEvents(workerId: String!, limit: Int): [GroceryOutboxEventResult!]!
        completeGroceryOutboxEvent(eventId: ID!, claimToken: String!, succeeded: Boolean!, unknown: Boolean, error: String): GroceryOutboxEventResult!
        replayGroceryOutboxEvent(eventId: ID!): GroceryOutboxEventResult!
        reconcileGroceryCustomerDelivery(eventId: ID!, action: String!, reason: String!, confirmDuplicateRisk: Boolean): GroceryOutboxEventResult!
        deliverGroceryOutboxNow(limit: Int): JSON!
        configureDeliverySlot(slotId: ID!, capacity: Int, deliveryFee: Int, isActive: Boolean, idempotencyKey: String!): StoreCapacityResult!
        configurePickupSlot(slotId: ID!, maxOrders: Int, isAvailable: Boolean, idempotencyKey: String!): StoreCapacityResult!
        configureParkingSpot(spotId: ID!, isAvailable: Boolean!, idempotencyKey: String!): StoreCapacityResult!
        adjustInventoryLot(inventoryLotId: ID!, targetQuantityRemaining: Float!, reason: String!, idempotencyKey: String!, note: String): InventoryAdjustmentResult!
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
        groceryDeliveryRescheduleSlots,
        groceryRecurringOverview,
        groceryPaymentWebhookRecovery,
        groceryCustomerPrivacy,
        groceryStaffDirectory,
        getGroceryOrderRefundLines,
        getGroceryLoyalty,
        groceryFinancialCloseExport,
        groceryFinancialCloses,
        groceryPlatformOrders,
        groceryPlatformFulfillment,
        groceryPlatformDelivery,
        groceryPlatformPickup,
        groceryPlatformInventory,
        groceryPlatformSuppliers,
        groceryPlatformPurchasing,
        groceryPurchasingOptions,
        groceryPlatformMerchandising,
        groceryPlatformCustomers,
        groceryPlatformCustomer,
        groceryPlatformPayments,
        groceryPlatformSettings,
        redirectToInit,
        groceryCart: getCart,
        customerOrderSubstitutions: getCustomerOrderSubstitutions,
        clippedCoupons: getClippedCoupons,
        activeCartPaymentProviders: async (_root: unknown, _args: unknown, context: any) => {
          const providers = await context.sudo().query.PaymentProvider.findMany({
            take: 100,
            query: 'id name code isInstalled publicCheckout supportsIdempotentCapture captureIdempotencyEvidence credentials metadata createPaymentFunction capturePaymentFunction refundPaymentFunction getPaymentStatusFunction getRefundStatusFunction cancelPaymentFunction generatePaymentLinkFunction handleWebhookFunction',
          });
          return providers.filter((provider: any) => {
            try { assertPublicPaymentProvider(provider); return true; }
            catch { return false; }
          }).map(({ id, name, code }: any) => ({ id, name, code, isInstalled: true }));
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
        recoverGroceryPaymentCreation,
        convertInventoryCases,
        rescheduleReturnedGroceryDelivery,
        importGroceryCatalog,
        replayPaymentWebhookEvent,
        exportGroceryCustomerData,
        reviewGroceryCustomerErasure,
        requestGroceryCustomerPrivacy,
        revokeGroceryStaffInvitation,
        updateGroceryStaffAccess,
        acceptGroceryStaffInvitation,
        inviteGroceryStaff,
        voidGroceryPaymentAuthorization,
        refundGroceryOrderLines,
        updateGroceryNotificationPreferences,
        processDueGrocerySubscriptions,
        manageGrocerySubscription,
        redeemGroceryLoyalty,
        configureGroceryLoyalty,
        resolveGrocerySettlementMatch,
        importGrocerySettlementStatement,
        createGroceryFinancialClose,
        manageSupplierSettlement,
        resolveDeliveryStop,
        updateProductInformation,
        authorizeOrderAdjustment,
        respondToOrderLineSubstitution,
        requestGuestOrderAccess,
        submitGroceryContactMessage,
        registerGroceryCustomer,
        saveFavoriteProduct,
        resumeGroceryCheckout,
        restartGroceryCheckout,
        updateGroceryDeliveryPolicy,
        manageInventoryCount,
        manageInventorySafety,
        finalizeGroceryOrderActuals,
        resolveOrderLineFulfillment,
        updateActiveUser,
        updateActiveUserPassword,
        recoverRevisedAuthorization,
        updateGroceryStoreProfile,
        provisionGroceryCustomer,
        initiatePaymentSession,
        addItemToGroceryCart: addToCart,
        updateGroceryCartItem: updateCartItem,
        removeItemFromGroceryCart: removeFromCart,
        clearGroceryCart: clearCart,
        mergeGuestGroceryCart: mergeGuestCart,
        updateGrocerySubstitutionPreference: updateSubstitutionPreference,
        requestGroceryBackInStockAlert,
        requestGroceryPriceAlert,

        // Recipe mutations

        // Shopping List mutations
        createCustomerShoppingList: createShoppingList,
        deleteCustomerShoppingList: deleteShoppingList,
        addToShoppingList: addToList,
        removeFromShoppingList: removeFromList,
        updateShoppingListItemQuantity: updateListItemQuantity,
        toggleShoppingListItemChecked: toggleListItemChecked,
        addShoppingListToCart: addListToCart,
        reorderGroceryOrder,

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
        updateGroceryStoreLogo,
        updateGroceryStorefrontBrandHue,
        advanceOrderFulfillment,
        recordOrderItemSubstitution,
        proposeOrderLineSubstitution,
        claimGroceryOutboxEvents,
        completeGroceryOutboxEvent,
        replayGroceryOutboxEvent,
        reconcileGroceryCustomerDelivery,
        deliverGroceryOutboxNow,
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
