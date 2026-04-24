// Grocery-specific types

export interface GroceryDepartment {
  id: string;
  name: string;
  handle: string;
  description?: string;
  imageUrl?: string;
  sortOrder?: number;
  isActive: boolean;
}

export interface GroceryProduct {
  id: string;
  name: string;
  handle: string;
  description?: string;
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
}

export interface GroceryOrder {
  id: string;
  orderNumber: string;
  status: 'pending' | 'confirmed' | 'processing' | 'picking' | 'out_for_delivery' | 'delivered' | 'cancelled';
  email?: string;
  items: GroceryOrderItem[];
  subtotal: number;
  tax_total: number;
  shipping_total: number;
  discount_total: number;
  total: number;
  shippingAddress?: ShippingAddress;
  deliverySlot?: DeliverySlot;
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
  homepageTitle?: string;
  homepageDescription?: string;
  logoUrl?: string;
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
}

export interface ShoppingList {
  id: string;
  name: string;
  updatedAt: string;
  items: ShoppingListItem[];
}

export interface ShoppingListItem {
  id: string;
  name: string;
  quantity: number;
  checked: boolean;
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
