import { mergeSchemas } from "@graphql-tools/schema";
import type { GraphQLSchema } from 'graphql';
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
import {
  clipCoupon,
  getClippedCoupons,
  unclipCoupon,
} from "./clipCoupon";
import {
  applyCoupons,
  markCouponsAsUsed,
  previewCouponDiscount,
} from "./applyCoupons";
import {
  createSubscription,
  updateSubscription,
  pauseSubscription,
  cancelSubscription,
  skipNextDelivery,
} from "./manageSubscription";
import {
  addRecipeToCart,
  scaleRecipe,
} from "./addRecipeToCart";
import {
  addToList,
  removeFromList,
  updateListItemQuantity,
  toggleListItemChecked,
  addListToCart,
} from "./manageShoppingList";
import {
  getAvailablePickupSlots,
  getPickupSlotsByDate,
  reservePickupSlot,
  releasePickupSlot,
} from "./getAvailablePickupSlots";
import {
  customerCheckIn,
  getAvailableParkingSpots,
  releaseParkingSpot,
  completeOrderHandoff,
} from "./customerCheckIn";
import submitGroceryOrder from './submitGroceryOrder';
import initiatePaymentSession from './initiatePaymentSession';
import {
  createDeliveryRouteFromOrders,
  updateDeliveryRouteWorkflow,
} from './manageDeliveryRoutes';

const graphql = String.raw;

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

      # Subscription types
      type GrocerySubscription {
        id: ID!
        productId: String!
        quantity: Int!
        frequency: String!
        nextDeliveryDate: String
        discount: Float
        isActive: Boolean!
        isPaused: Boolean!
        pausedUntil: String
        skippedDate: String
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

      type AddListToCartResult {
        success: Boolean!
        message: String!
        addedCount: Int!
        skippedCount: Int!
        skippedItems: [String!]!
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

      type ReservePickupSlotResult {
        success: Boolean!
        slotId: ID!
        orderId: ID!
        pickupDate: String!
        pickupStartTime: String!
        pickupEndTime: String!
        remainingCapacity: Int!
      }

      type ReleasePickupSlotResult {
        success: Boolean!
        slotId: ID!
        remainingCapacity: Int!
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

      type Query {
        redirectToInit: Boolean
        groceryCart(sessionId: String): GroceryCart
        clippedCoupons: [ClippedCoupon!]!
        scaleRecipe(recipeId: ID!, targetServings: Int!): ScaledRecipe!
        activeCartPaymentProviders: [PaymentProvider!]!

        # Pickup Slot queries
        availablePickupSlots(days: Int, minCapacity: Int): [PickupSlotResult!]!
        pickupSlotsByDate(days: Int, minCapacity: Int): [PickupSlotsByDateResult!]!

        # Parking Spot queries
        availableParkingSpots(accessibleOnly: Boolean): [ParkingSpotResult!]!
      }

      type Mutation {
        updateActiveUser(data: UserUpdateProfileInput!): User
        initiatePaymentSession(cartId: ID!, paymentProviderId: String!, deliverySlotId: ID, pickupSlotId: ID, sessionId: String): PaymentSession
        addItemToGroceryCart(productId: ID!, quantity: Int!, sessionId: String): GroceryCart
        updateGroceryCartItem(itemId: ID!, quantity: Int!, sessionId: String): GroceryCart
        removeItemFromGroceryCart(itemId: ID!, sessionId: String): GroceryCart
        clearGroceryCart(sessionId: String): GroceryCart
        mergeGuestGroceryCart(guestSessionId: String!): GroceryCart
        updateGrocerySubstitutionPreference(itemId: ID!, preference: String!, sessionId: String): GroceryCart

        # Coupon mutations
        clipCoupon(couponId: ID, couponCode: String): ClipCouponResult!
        unclipCoupon(userCouponId: ID!): UnclipCouponResult!
        applyCoupons(userCouponIds: [ID!], sessionId: String): ApplyCouponsResult!
        markCouponsAsUsed(userCouponIds: [ID!]!): MarkCouponsUsedResult!
        previewCouponDiscount(couponCode: String!, sessionId: String): PreviewCouponResult!

        # Subscription mutations
        createGrocerySubscription(productId: ID!, quantity: Int!, frequency: String!, deliveryDay: String): GrocerySubscription!
        updateGrocerySubscription(subscriptionId: ID!, quantity: Int, frequency: String): GrocerySubscription!
        pauseGrocerySubscription(subscriptionId: ID!, pauseUntil: String!): GrocerySubscription!
        cancelGrocerySubscription(subscriptionId: ID!): GrocerySubscription!
        skipNextGroceryDelivery(subscriptionId: ID!): GrocerySubscription!

        # Recipe mutations
        addRecipeToCart(recipeId: ID!, servings: Int, sessionId: String, includeOptional: Boolean): AddRecipeToCartResult!

        # Shopping List mutations
        addToShoppingList(listId: ID!, product: String!, quantity: Int, unit: String, notes: String): ShoppingListResult!
        removeFromShoppingList(listId: ID!, itemId: ID!): ShoppingListResult!
        updateShoppingListItemQuantity(listId: ID!, itemId: ID!, quantity: Int!): ShoppingListResult!
        toggleShoppingListItemChecked(listId: ID!, itemId: ID!): ShoppingListResult!
        addShoppingListToCart(listId: ID!, sessionId: String): AddListToCartResult!

        # Pickup Slot mutations
        reservePickupSlot(slotId: ID!, orderId: ID!): ReservePickupSlotResult!
        releasePickupSlot(slotId: ID!, orderId: ID): ReleasePickupSlotResult!

        # Customer Check-in mutations
        customerCheckIn(orderId: ID!, parkingSpotId: ID, vehicleDescription: String): CustomerCheckInResult!
        releaseParkingSpot(parkingSpotId: ID!, orderId: ID!): ReleaseParkingSpotResult!
        completeOrderHandoff(orderId: ID!): CompleteOrderHandoffResult!
        createDeliveryRouteFromOrders(deliveryDate: String!, deliveryTimeWindow: String!, orderIds: [ID!]!, driverId: ID): DeliveryRouteWorkflowResult!
        updateDeliveryRouteWorkflow(routeId: ID!, status: String!): DeliveryRouteWorkflowResult!
        submitGroceryOrder(data: SubmitGroceryOrderInput!): SubmitGroceryOrderResult!
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

      input SubmitGroceryOrderInput {
        cartId: ID!
        paymentSessionId: ID!
        paymentIntentId: String!
        sessionId: String
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
        message: String!
      }
    `,
    resolvers: {
      Query: {
        redirectToInit,
        groceryCart: getCart,
        clippedCoupons: getClippedCoupons,
        scaleRecipe,
        activeCartPaymentProviders: async (_root: unknown, _args: unknown, context: any) => {
          return context.sudo().query.PaymentProvider.findMany({
            where: { isInstalled: { equals: true } },
            query: 'id name code isInstalled',
          });
        },
        availablePickupSlots: getAvailablePickupSlots,
        pickupSlotsByDate: getPickupSlotsByDate,
        availableParkingSpots: getAvailableParkingSpots,
      },
      Mutation: {
        updateActiveUser,
        initiatePaymentSession,
        addItemToGroceryCart: addToCart,
        updateGroceryCartItem: updateCartItem,
        removeItemFromGroceryCart: removeFromCart,
        clearGroceryCart: clearCart,
        mergeGuestGroceryCart: mergeGuestCart,
        updateGrocerySubstitutionPreference: updateSubstitutionPreference,

        // Coupon mutations
        clipCoupon,
        unclipCoupon,
        applyCoupons,
        markCouponsAsUsed,
        previewCouponDiscount,

        // Subscription mutations
        createGrocerySubscription: createSubscription,
        updateGrocerySubscription: updateSubscription,
        pauseGrocerySubscription: pauseSubscription,
        cancelGrocerySubscription: cancelSubscription,
        skipNextGroceryDelivery: skipNextDelivery,

        // Recipe mutations
        addRecipeToCart,

        // Shopping List mutations
        addToShoppingList: addToList,
        removeFromShoppingList: removeFromList,
        updateShoppingListItemQuantity: updateListItemQuantity,
        toggleShoppingListItemChecked: toggleListItemChecked,
        addShoppingListToCart: addListToCart,

        // Pickup Slot mutations
        reservePickupSlot,
        releasePickupSlot,

        // Customer Check-in mutations
        customerCheckIn,
        releaseParkingSpot,
        completeOrderHandoff,
        createDeliveryRouteFromOrders,
        updateDeliveryRouteWorkflow,
        submitGroceryOrder,
      },
    },
  });
}
