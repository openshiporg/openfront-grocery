import { Address } from "./Address";
import { BackInStockAlert } from "./BackInStockAlert";
import { Cart } from "./Cart";
import { CheckoutAttempt } from './CheckoutAttempt';
import { CartItem } from "./CartItem";
import { Coupon } from "./Coupon";
import { Department } from "./Department";
import { DeliveryRoute } from "./DeliveryRoute";
import { DeliverySlot } from "./DeliverySlot";
import { FavoriteProduct } from "./FavoriteProduct";
import { GroceryOutboxEvent } from './GroceryOutboxEvent';
import { InventoryLot } from "./InventoryLot";
import { InventoryAdjustment } from './InventoryAdjustment';
import { LoyaltyProgram } from "./LoyaltyProgram";
import { LoyaltyTransaction } from "./LoyaltyTransaction";
import { NotificationPreference } from "./NotificationPreference";
import { Order } from "./Order";
import { OrderItemSubstitution } from "./OrderItemSubstitution";
import { OrderLineItem } from "./OrderLineItem";
import { OrderLineInventoryAllocation } from './OrderLineInventoryAllocation';
import { ParkingSpot } from "./ParkingSpot";
import { Payment } from "./Payment";
import { PaymentProvider } from './PaymentProvider';
import { PaymentRefund } from './PaymentRefund';
import { PaymentSession } from './PaymentSession';
import { PaymentWebhookEvent } from './PaymentWebhookEvent';
import { PickupSlot } from "./PickupSlot";
import { POItem } from "./POItem";
import { PriceAlert } from "./PriceAlert";
import { Product } from "./Product";
import { PurchaseOrder } from "./PurchaseOrder";
import { Recipe } from "./Recipe";
import { RecipeIngredient } from "./RecipeIngredient";
import { RateLimitBucket } from './RateLimitBucket';
import { Role } from "./Role";
import { ShoppingList } from "./ShoppingList";
import { ShoppingListItem } from "./ShoppingListItem";
import { Subscription } from "./Subscription";
import { SubstitutionPreference } from "./SubstitutionPreference";
import { Store } from './Store';
import { StoreSettings } from './StoreSettings';
import { Supplier } from "./Supplier";
import { User } from "./User";
import { UserCoupon } from "./UserCoupon";

export const models = {
  Address,
  BackInStockAlert,
  Cart,
  CheckoutAttempt,
  CartItem,
  Coupon,
  Department,
  DeliveryRoute,
  DeliverySlot,
  FavoriteProduct,
  GroceryOutboxEvent,
  InventoryLot,
  InventoryAdjustment,
  LoyaltyProgram,
  LoyaltyTransaction,
  NotificationPreference,
  Order,
  OrderItemSubstitution,
  OrderLineItem,
  OrderLineInventoryAllocation,
  ParkingSpot,
  Payment,
  PaymentProvider,
  PaymentRefund,
  PaymentSession,
  PaymentWebhookEvent,
  PickupSlot,
  POItem,
  PriceAlert,
  Product,
  PurchaseOrder,
  Recipe,
  RecipeIngredient,
  RateLimitBucket,
  Role,
  ShoppingList,
  ShoppingListItem,
  Subscription,
  SubstitutionPreference,
  Store,
  StoreSettings,
  Supplier,
  User,
  UserCoupon,
};

export default models;
