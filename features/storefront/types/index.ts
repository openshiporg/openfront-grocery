// Grocery-specific types

export interface GroceryDepartment {
  id: string;
  name: string;
  handle: string;
  description?: string;
  imageUrl?: string;
  sortOrder?: number;
  isActive: boolean;
  productsCount?: number;
  temperatureZone?: string;
}

export interface GroceryProduct {
  id: string;
  name: string;
  handle: string;
  description?: unknown;
  sku: string;
  barcode?: string;
  price: number;
  compareAtPrice?: number;
  unitPrice?: number;
  unit?: string; // lb, oz, each, etc.
  imageUrl?: string;
  thumbnailUrl?: string;
  isPerishable: boolean;
  expirationDate?: string;
  inStock: boolean;
  stockQuantity: number;
  backInStockRequested?: boolean;
  organicCertified?: boolean;
  department?: GroceryDepartment;
  supplier?: GrocerySupplier;
}

export interface GrocerySupplier {
  id: string;
  name: string;
  contactEmail?: string;
  contactPhone?: string;
}

export interface GroceryCartItem {
  id: string;
  product: GroceryProduct;
  quantity: number;
  subtotal: number;
  substitutionPreference?: 'allow' | 'contact' | 'remove';
}

export interface GroceryCart {
  id: string;
  items: GroceryCartItem[];
  subtotal: number;
  tax: number;
  deliveryFee: number;
  total: number;
  itemCount: number;
}

export interface DeliveryWindow {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  available: boolean;
  fee: number;
  method?: 'delivery' | 'pickup';
  remainingCapacity?: number;
}

export interface GroceryOrder {
  id: string;
  orderNumber: string;
  status: 'pending' | 'confirmed' | 'processing' | 'picking' | 'ready_for_pickup' | 'out_for_delivery' | 'delivered' | 'cancelled';
  email?: string;
  items: GroceryOrderItem[];
  subtotal: number;
  tax_total: number;
  shipping_total: number;
  discount_total: number;
  total: number;
  shippingAddress?: ShippingAddress;
  fulfillmentMethod?: 'delivery' | 'pickup';
  deliverySlot?: DeliverySlot;
  pickupCheckIn?: GroceryPickupCheckIn;
  deliveryInstructions?: string;
  substitutionPreference: 'allow' | 'contact' | 'remove';
  createdAt: string;
  updatedAt?: string;
}

export interface GroceryUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  addresses?: GroceryAddress[];
}

export interface GroceryAddress {
  id: string;
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  isDefault: boolean;
}

export interface GroceryStore {
  id: string;
  name: string;
  tagline?: string;
  homepageTitle?: string;
  homepageDescription?: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  logoUrl?: string;
  brandHue: number | null;
  effectiveBrandHue: number;
  currencyCode?: string;
  locale?: string;
  timezone?: string;
  countryCode?: string;
}

export interface ShippingAddress {
  firstName: string;
  lastName: string;
  address1: string;
  address2?: string;
  city: string;
  province: string;
  postalCode: string;
  countryCode?: string;
  phone?: string;
}

export interface DeliverySlot {
  date: string;
  startTime: string;
  endTime: string;
}

export interface GroceryOrderItem {
  id: string;
  title: string;
  variant?: { title: string };
  quantity: number;
  unit_price: number;
  thumbnail?: string;
  product?: { id: string; handle: string };
  substitutionPreference?: string | null;
  substitution?: GroceryOrderSubstitution;
}

export interface GroceryOrderSubstitution {
  id: string;
  originalProduct: string;
  substitutedProduct: string;
  reason?: string | null;
  customerApproved: boolean;
  approvedAt?: string | null;
}

export interface GroceryPickupCheckIn {
  customerArrived: boolean;
  checkInTime?: string | null;
  parkingSpotId?: string | null;
  parkingSpotNumber?: string | null;
  vehicleDescription?: string | null;
}

export interface GroceryParkingSpot {
  id: string;
  spotNumber: string;
  description?: string | null;
  isAccessible: boolean;
  isAvailable: boolean;
}

export interface ShoppingList {
  id: string;
  name: string;
  updatedAt: string;
  isDefault?: boolean;
  itemCount?: number;
  checkedCount?: number;
  items: ShoppingListItem[];
}

export interface ShoppingListItem {
  id: string;
  name: string;
  quantity: number;
  checked: boolean;
  unit?: string;
  notes?: string;
  addedAt?: string;
  product?: GroceryProduct;
}

export interface GroceryDeal {
  id: string;
  type: 'weekly' | 'coupon' | 'flash';
  discountCode?: string;
  discountValue: number;
  discountType: 'percentage' | 'fixed';
  description?: string;
  minimumPurchase?: number;
  expiresAt?: string;
  product?: GroceryProduct;
  categories?: { id: string; name: string; handle: string }[];
}

export interface GrocerySubscription {
  id: string;
  product: string;
  productDetails?: GroceryProduct;
  quantity: number;
  frequency: 'weekly' | 'biweekly' | 'monthly';
  nextDeliveryDate: string;
  discount: number;
  isActive: boolean;
  pausedUntil?: string | null;
  createdAt: string;
}
