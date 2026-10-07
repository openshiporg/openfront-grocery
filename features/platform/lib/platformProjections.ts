import type { PlatformPagination } from '../components/PlatformPageLinks';
import { gql } from 'graphql-request';

import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';

export type PlatformMetadata = Record<string, unknown> | null;

export interface GroceryPlatformLineItem {
  product?: {id:string;pricingMethod:string;unitOfMeasure:string} | null;
  fulfillment?: {resolution:string;productTitle:string;quantityMilli:number;unitOfMeasure:string;subtotalCents:number} | null;
  id: string;
  title: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  unitPriceCents: number;
  thumbnail: string;
  metadata: PlatformMetadata;
}

export interface GroceryPlatformPaymentRefund {
  id: string;
  amountCents: number;
  status: string;
  reason: string;
  requestedAt?: string | null;
  processedAt?: string | null;
  failureMessage?: string | null;
  reconciliationAttempts: number;
  reconciliationNextAttemptAt?: string | null;
  reconciliationDeadLetterAt?: string | null;
  reconciliationLastError?: string | null;
}

export interface GroceryPlatformPayment {
  id: string;
  amountCents: number;
  status: string;
  providerPaymentId?: string | null;
  processedAt?: string | null;
  errorMessage?: string | null;
  providerCode: string;
  refunds: GroceryPlatformPaymentRefund[];
}

export interface GroceryPlatformOrder {
  id: string;
  displayId: number;
  email: string;
  status: string;
  deliveryDate?: string | null;
  deliveryTimeWindow: string;
  createdAt?: string | null;
  currencyCode: string;
  subtotalCents: number;
  taxCents: number;
  deliveryFeeCents: number;
  discountCents: number;
  totalCents: number;
  substitutionPreference?: string | null;
  metadata: PlatformMetadata;
  lineItems: GroceryPlatformLineItem[];
  payments: GroceryPlatformPayment[];
}

interface OrdersProjection {
  currencyCode: string;
  orders: GroceryPlatformOrder[];
  page: number;
  pageSize: number;
  totalOrders: number;
  totalPages: number;
  salesSummary: {
    todayOrders: number;
    todayGrossCents: number;
    thirtyDayOrders: number;
    thirtyDayGrossCents: number;
    thirtyDayRefundCents: number;
    thirtyDayNetCents: number;
    averageBasketCents: number;
  };
  pending: number;
  picking: number;
  packed: number;
  outForDelivery: number;
  delivered: number;
}

interface FulfillmentProjection {
  pagination: PlatformPagination;
  pending: GroceryPlatformOrder[];
  picking: GroceryPlatformOrder[];
  packed: GroceryPlatformOrder[];
  orderItemSubstitutions: Array<{
    id: string;
    orderItem: string;
    originalProduct: string;
    substitutedProduct: string;
    reason: string;
    customerApproved: boolean;
    approvedAt?: string | null;
  }>;
}

export interface GroceryPlatformDriver { id: string; name: string; email: string }
export interface GroceryPlatformSupplier { id: string; name: string }

interface DeliveryProjection {
  pagination: PlatformPagination;
  deliveryRoutes: Array<{
    id: string;
    date: string;
    timeWindow: string;
    status: string;
    startedAt?: string | null;
    completedAt?: string | null;
    driver?: GroceryPlatformDriver | null;
    orders: Array<{ id: string; displayId: number; status: string; metadata: PlatformMetadata }>;
  }>;
  readyOrders: GroceryPlatformOrder[];
  drivers: GroceryPlatformDriver[];
  deliverySlots: Array<{ id: string; date: string; startTime: string; endTime: string; capacity: number; currentBookings: number; isActive: boolean; deliveryFee: number }>;
}

interface PickupProjection {
  pagination: PlatformPagination;
  pickupSlots: Array<{ id: string; date: string; startTime: string; endTime: string; maxOrders: number; currentOrders: number; isAvailable: boolean }>;
  parkingSpots: Array<{ id: string; spotNumber: string; description?: string | null; isAccessible: boolean; isAvailable: boolean }>;
  pickupOrders: Array<{ id: string; displayId: number; email: string; status: string; metadata: PlatformMetadata }>;
}

interface InventoryProjection {
  pagination: PlatformPagination;
  products: Array<{ id: string; title: string; sku: string; stockQuantity?: number | null; recordedStockQuantity: number; lowStockThreshold?: number | null; inStock: boolean; activeBackInStockAlerts: number; department?: string | null; supplier?: GroceryPlatformSupplier | null }>;
  inventoryLots: Array<{ id: string; lotNumber: string; expirationDate: string; quantity: number; quantityRemaining: number; safetyStatus?: string; conditionStatus?: string; location?: string | null; isExpired: boolean; isExpiringSoon: boolean; product?: { id: string; title: string } | null; supplier?: GroceryPlatformSupplier | null }>;
}

interface SuppliersProjection {
  pagination: PlatformPagination;
  currencyCode: string;
  suppliers: Array<GroceryPlatformSupplier & { contactName?: string | null; email: string; phone?: string | null; paymentTerms?: string | null; deliveryDays?: string[] | null; minimumOrder?: number | null; minimumOrderCents: number; productCount: number; purchaseOrderCount: number; openPurchaseOrderCount: number; products: Array<{ id: string }>; purchaseOrders: Array<{ id: string; status?: string | null }> }>;
}

interface PurchasingProjection {
  pagination: PlatformPagination;
  currencyCode: string;
  purchaseOrders: Array<{ id: string; poNumber: string; orderDate: string; expectedDeliveryDate?: string | null; status?: string | null; totalAmount?: number | null; totalAmountCents?: number; notes?: string | null; isDueSoon: boolean; supplier?: GroceryPlatformSupplier | null; items: Array<{ id: string; productTitle: string; productSku: string; quantity: number; quantityReceived?: number; unitCost: number; unitCostCents?: number }> }>;
}

interface PurchasingOption { id: string; name?: string | null; title?: string | null }

interface MerchandisingProjection {
  pagination: PlatformPagination;
  currencyCode: string;
  departments: Array<{ id: string; name: string; handle: string; sortOrder?: number | null; isActive: boolean; temperatureZone?: string | null; productCount: number; products: Array<{ id: string }> }>;
  coupons: Array<{ id: string; code: string; discountType: string; discountValue?: number | null; discountValueCents: number; minPurchase?: number | null; minPurchaseCents: number; maxUses: number; currentUses: number; productCategories?: string[] | null; isActive: boolean; validFrom?: string | null; validTo?: string | null }>;
}

interface CustomersProjection {
  pagination: PlatformPagination;
  users: Array<{ id: string; name: string; email: string; onboardingStatus?: string | null; createdAt: string; orderCount: number; shoppingListCount: number; lastOrder?: { displayId: number; status: string; createdAt: string } | null }>;
  totalCustomers: number;
  savedCarts: number;
}

interface PaymentsProjection {
  pagination: PlatformPagination;
  currencyCode: string;
  payments: Array<GroceryPlatformPayment & { paymentMethod?: string | null; createdAt: string; order: { id: string; displayId: number; status: string } }>;
  providers: Array<{ id: string; name: string; code: string; isInstalled: boolean; publicCheckout: boolean; runtimeConfigured: boolean }>;
  summary: { paymentCount: number; failedCount: number; processingCount: number; capturedCents: number; refundedCents: number; netCents: number; recovery: Record<string, number> };
}

interface SettingsProjection {
  store: { id: string; name: string; timezone: string; currencyCode: string; isActive: boolean };
  settings: { id: string; name: string; tagline: string; homepageTitle: string; homepageDescription: string; contactEmail: string; contactPhone: string; address: string; logoUrl: string; brandHue: number | null; currencyCode: string; taxRateBps: number; locale: string; timezone: string; countryCode: string; hours: Record<string, unknown>; isActive: boolean };
  counts: { products: number; suppliers: number; deliverySlots: number; pickupSlots: number; parkingSpots: number };
}

async function readProjection<T>(query: string, field: string, variables: Record<string, unknown> = {}): Promise<T | null> {
  const response = await keystoneClient<{ [key: string]: T }>(gql`${query}`, variables);
  if (!response.success || !response.data?.[field]) {
    throw new Error(`Unable to load ${field}. Refresh and retry.`);
  }
  return response.data[field];
}

export const platformProjectionQueries = {
  orders: `query GroceryPlatformOrders($page:Int,$pageSize:Int) { groceryPlatformOrders(page:$page,pageSize:$pageSize) { currencyCode page pageSize totalOrders totalPages orders { id displayId email status deliveryDate deliveryTimeWindow metadata createdAt currencyCode subtotalCents taxCents deliveryFeeCents discountCents totalCents lineItems { id title sku quantity unitPrice unitPriceCents thumbnail metadata product fulfillment } payments { id amountCents status providerPaymentId processedAt errorMessage providerCode refunds { id amountCents status reason requestedAt processedAt failureMessage reconciliationAttempts reconciliationNextAttemptAt reconciliationDeadLetterAt reconciliationLastError } } } salesSummary { todayOrders todayGrossCents thirtyDayOrders thirtyDayGrossCents thirtyDayRefundCents thirtyDayNetCents averageBasketCents } pending picking packed outForDelivery delivered } }`,
  fulfillment: `query GroceryPlatformFulfillment($page:Int,$pageSize:Int,$search:String,$status:String) { groceryPlatformFulfillment(page:$page,pageSize:$pageSize,search:$search,status:$status) { pagination pending { id displayId email status deliveryTimeWindow substitutionPreference metadata lineItems { id quantity title sku metadata product fulfillment } } picking { id displayId email status deliveryTimeWindow substitutionPreference metadata lineItems { id quantity title sku metadata product fulfillment } } packed { id displayId email status deliveryTimeWindow substitutionPreference metadata lineItems { id quantity title sku metadata product fulfillment } } orderItemSubstitutions { id orderItem originalProduct substitutedProduct reason customerApproved approvedAt } } }`,
  delivery: `query GroceryPlatformDelivery($page:Int,$pageSize:Int,$search:String,$status:String) { groceryPlatformDelivery(page:$page,pageSize:$pageSize,search:$search,status:$status) { pagination deliveryRoutes { id date timeWindow status stops startedAt completedAt driver { id name email } orders { id displayId status metadata } } readyOrders { id displayId email status deliveryDate deliveryTimeWindow metadata lineItems { id quantity title sku metadata product fulfillment } } drivers { id name email } deliverySlots { id date startTime endTime capacity currentBookings isActive deliveryFee } } }`,
  pickup: `query GroceryPlatformPickup($page:Int,$pageSize:Int,$search:String,$status:String) { groceryPlatformPickup(page:$page,pageSize:$pageSize,search:$search,status:$status) { pagination pickupSlots { id date startTime endTime maxOrders currentOrders isAvailable } parkingSpots { id spotNumber description isAccessible isAvailable } pickupOrders { id displayId email status metadata } } }`,
  inventory: `query GroceryPlatformInventory($page:Int,$pageSize:Int,$search:String,$status:String) { groceryPlatformInventory(page:$page,pageSize:$pageSize,search:$search,status:$status) { pagination products { id title sku stockQuantity recordedStockQuantity lowStockThreshold inStock activeBackInStockAlerts department supplier { id name } } inventoryLots { id lotNumber expirationDate quantity quantityRemaining safetyStatus conditionStatus location isExpired isExpiringSoon product { id title } supplier { id name } } } }`,
  suppliers: `query GroceryPlatformSuppliers($page:Int,$pageSize:Int,$search:String,$status:String) { groceryPlatformSuppliers(page:$page,pageSize:$pageSize,search:$search,status:$status) { pagination currencyCode suppliers { id name contactName email phone paymentTerms deliveryDays minimumOrder minimumOrderCents productCount purchaseOrderCount openPurchaseOrderCount products { id } purchaseOrders { id status } } } }`,
  purchasing: `query GroceryPlatformPurchasing($page:Int,$pageSize:Int,$search:String,$status:String) { groceryPlatformPurchasing(page:$page,pageSize:$pageSize,search:$search,status:$status) { pagination currencyCode purchaseOrders { id poNumber orderDate expectedDeliveryDate status totalAmount totalAmountCents notes isDueSoon supplier { id name } items { id productTitle productSku quantity quantityReceived unitCost unitCostCents } } } }`,
  purchasingOptions: `query GroceryPurchasingOptions($kind:String!,$search:String!) { groceryPurchasingOptions(kind:$kind,search:$search) { id name title } }`,
  merchandising: `query GroceryPlatformMerchandising($page:Int,$pageSize:Int,$search:String,$status:String) { groceryPlatformMerchandising(page:$page,pageSize:$pageSize,search:$search,status:$status) { pagination currencyCode departments { id name handle sortOrder isActive temperatureZone productCount products { id } } coupons { id code discountType discountValue discountValueCents minPurchase minPurchaseCents maxUses currentUses productCategories isActive validFrom validTo } } }`,
  customers: `query GroceryPlatformCustomers($page:Int,$pageSize:Int,$search:String,$status:String) { groceryPlatformCustomers(page:$page,pageSize:$pageSize,search:$search,status:$status) { pagination users { id name email onboardingStatus createdAt orderCount shoppingListCount lastOrder { displayId status createdAt } } totalCustomers savedCarts } }`,
  payments: `query GroceryPlatformPayments($page:Int,$pageSize:Int,$search:String,$status:String) { groceryPlatformPayments(page:$page,pageSize:$pageSize,search:$search,status:$status) { pagination currencyCode payments { id amountCents status paymentMethod providerPaymentId providerCode processedAt createdAt errorMessage order { id displayId status } refunds { id amountCents status reason requestedAt processedAt failureMessage reconciliationAttempts reconciliationNextAttemptAt reconciliationDeadLetterAt reconciliationLastError } } providers { id name code isInstalled publicCheckout runtimeConfigured } summary { paymentCount failedCount processingCount capturedCents refundedCents netCents recovery } } }`,
  settings: `query GroceryPlatformSettings { groceryPlatformSettings { store { id name timezone currencyCode isActive } settings { id name tagline homepageTitle homepageDescription contactEmail contactPhone address logoUrl brandHue currencyCode taxRateBps locale timezone countryCode hours deliveryPolicy isActive } counts { products suppliers deliverySlots pickupSlots parkingSpots } } }`,
} as const;

export const platformProjections = {
  orders: (page = 1, pageSize = 50) => readProjection<OrdersProjection>(platformProjectionQueries.orders, 'groceryPlatformOrders', { page, pageSize }),
  fulfillment: (page=1,pageSize=50,search="",status="") => readProjection<FulfillmentProjection>(platformProjectionQueries.fulfillment, 'groceryPlatformFulfillment',{page,pageSize,search,status}),
  delivery: (page=1,pageSize=50,search="",status="") => readProjection<DeliveryProjection>(platformProjectionQueries.delivery, 'groceryPlatformDelivery',{page,pageSize,search,status}),
  pickup: (page=1,pageSize=50,search="",status="") => readProjection<PickupProjection>(platformProjectionQueries.pickup, 'groceryPlatformPickup',{page,pageSize,search,status}),
  inventory: (page=1,pageSize=50,search="",status="") => readProjection<InventoryProjection>(platformProjectionQueries.inventory, 'groceryPlatformInventory',{page,pageSize,search,status}),
  suppliers: (page=1,pageSize=50,search="",status="") => readProjection<SuppliersProjection>(platformProjectionQueries.suppliers, 'groceryPlatformSuppliers',{page,pageSize,search,status}),
  purchasing: (page=1,pageSize=50,search="",status="") => readProjection<PurchasingProjection>(platformProjectionQueries.purchasing, 'groceryPlatformPurchasing',{page,pageSize,search,status}),
  purchasingOptions: (kind: 'supplier' | 'product', search = '') => readProjection<PurchasingOption[]>(platformProjectionQueries.purchasingOptions, 'groceryPurchasingOptions', { kind, search }),
  merchandising: (page=1,pageSize=50,search="",status="") => readProjection<MerchandisingProjection>(platformProjectionQueries.merchandising, 'groceryPlatformMerchandising',{page,pageSize,search,status}),
  customers: (page=1,pageSize=50,search="",status="") => readProjection<CustomersProjection>(platformProjectionQueries.customers, 'groceryPlatformCustomers',{page,pageSize,search,status}),
  payments: (page=1,pageSize=50,search="",status="") => readProjection<PaymentsProjection>(platformProjectionQueries.payments, 'groceryPlatformPayments',{page,pageSize,search,status}),
  settings: () => readProjection<SettingsProjection>(platformProjectionQueries.settings, 'groceryPlatformSettings'),
};
