import type { PlatformPagination } from '../components/PlatformPageLinks';
import { gql } from 'graphql-request';

import { keystoneClient } from '@/features/platform/lib/platformClient';

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
  timezone: string;
  view: string;
  /** Matching-order counts per view (active, exceptions, attention, all and each status), for the current search. */
  viewCounts: Record<string, number>;
  /** Whether the signed-in staff member may refund payments (refund controls are hidden otherwise). */
  actorCanRefund: boolean;
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
  timezone: string;
  view: string;
  /** Matching orders per lane (current search and view), plus store-wide review work. */
  summary: { pending: number; picking: number; packed: number; substitutionsToReview: number; pickupNotReady: number };
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

export type DeliveryRouteView = 'open' | 'planning' | 'in_progress' | 'completed' | 'all';
interface DeliveryProjection {
  timezone: string;
  routeView: DeliveryRouteView;
  routeViewCounts: Record<DeliveryRouteView, number>;
  slotView: 'all' | 'open' | 'closed' | 'pressure';
  slotSort: 'date' | 'pressure' | 'capacity';
  /** Each queue pages on its own: routes (`page`), ready orders (`readyPage`) and slots (`slotPage`). */
  pagination: PlatformPagination;
  readyPagination: PlatformPagination;
  slotPagination: PlatformPagination;
  /** Store-wide totals, independent of search and paging. */
  summary: { readyToRoute: number; openRoutes: number; inProgress: number; drivers: number; openCapacity: number; highPressureSlots: number };
  driversTruncated: boolean;
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
  readyOrders: Array<{ id: string; displayId: number; email: string; status: string; deliveryDate?: string | null; deliveryTimeWindow?: string | null; metadata: PlatformMetadata; lineItems: Array<{ id: string; quantity: number }> }>;
  drivers: GroceryPlatformDriver[];
  deliverySlots: Array<{ id: string; date: string; startTime: string; endTime: string; capacity: number; currentBookings: number; isActive: boolean; deliveryFee: number }>;
}

type PickupQueueOrder = { id: string; displayId: number; email: string; status: string; metadata: PlatformMetadata };
interface PickupProjection {
  slotView: 'all' | 'open' | 'closed' | 'pressure';
  slotSort: 'date' | 'pressure' | 'capacity';
  /** Arrivals (`arrivalPage`), staged orders (`stagedPage`) and slots (`slotPage`) page independently. */
  pagination: PlatformPagination;
  stagedPagination: PlatformPagination;
  slotPagination: PlatformPagination;
  /** Store-wide totals, independent of search and paging. */
  summary: { waiting: number; staged: number; openCapacity: number; highPressureSlots: number; parkingSpots: number; parkingInUse: number };
  pickupSlots: Array<{ id: string; date: string; startTime: string; endTime: string; maxOrders: number; currentOrders: number; isAvailable: boolean }>;
  parkingSpots: Array<{ id: string; spotNumber: string; description?: string | null; isAccessible: boolean; isAvailable: boolean }>;
  occupiedSpotIds: string[];
  /** Checked-in customers, longest wait first. */
  arrivals: PickupQueueOrder[];
  stagedOrders: PickupQueueOrder[];
}

interface InventoryProjection {
  pagination: PlatformPagination;
  products: Array<{ id: string; title: string; sku: string; stockQuantity?: number | null; recordedStockQuantity: number; lowStockThreshold?: number | null; inStock: boolean; activeBackInStockAlerts: number; department?: string | null; unitOfMeasure?: string | null; supplier?: GroceryPlatformSupplier | null }>;
  inventoryLots: Array<{ id: string; lotNumber: string; expirationDate: string; quantity: number; quantityRemaining: number; safetyStatus?: string; conditionStatus?: string; location?: string | null; isExpired: boolean; isExpiringSoon: boolean; product?: { id: string; title: string; unitOfMeasure?: string | null } | null; supplier?: GroceryPlatformSupplier | null }>;
  lotViewCounts: Record<'attention' | 'expiring' | 'expired' | 'empty' | 'all', number>;
}

interface SuppliersProjection {
  pagination: PlatformPagination;
  currencyCode: string;
  suppliers: Array<GroceryPlatformSupplier & { contactName?: string | null; email: string; phone?: string | null; paymentTerms?: string | null; deliveryDays?: string[] | null; minimumOrder?: number | null; minimumOrderCents: number; productCount: number; purchaseOrderCount: number; openPurchaseOrderCount: number; products: Array<{ id: string }>; purchaseOrders: Array<{ id: string; status?: string | null }> }>;
  viewCounts: Record<'all' | 'open_po' | 'no_products' | 'cod' | 'net_30' | 'net_60', number>;
  /** Open purchase orders across every supplier in the store. */
  openPurchaseOrders: number;
}

interface PurchasingProjection {
  pagination: PlatformPagination;
  currencyCode: string;
  /** Matching purchase orders per status for the current search. */
  statusCounts: Record<string, number>;
  /** Open purchase orders expected within three days, including overdue ones. */
  dueSoonCount: number;
  openCommittedCents: number;
  purchaseOrders: Array<{ id: string; poNumber: string; orderDate: string; expectedDeliveryDate?: string | null; status?: string | null; totalAmount?: number | null; totalAmountCents?: number; notes?: string | null; isDueSoon: boolean; supplier?: GroceryPlatformSupplier | null; items: Array<{ id: string; productTitle: string; productSku: string; quantity: number; quantityReceived?: number; unitCost: number; unitCostCents?: number }> }>;
}

interface PurchasingOption { id: string; name?: string | null; title?: string | null }

interface MerchandisingProjection {
  pagination: PlatformPagination;
  currencyCode: string;
  departments: Array<{ id: string; name: string; handle: string; description?: string | null; imageUrl?: string | null; sortOrder?: number | null; isActive: boolean; temperatureZone?: string | null; requiredLicenses: string[]; productCount: number; products: Array<{ id: string }> }>;
  /** `productCategories` is null when a coupon applies to every department; an unreadable stored restriction sets `categoryRestrictionValid` false. */
  coupons: Array<{ id: string; code: string; discountType: string; discountValue?: number | null; discountValueCents: number; minPurchase?: number | null; minPurchaseCents: number; maxUses: number; currentUses: number; productCategories?: string[] | null; categoryRestrictionValid: boolean; isActive: boolean; validFrom?: string | null; validTo?: string | null }>;
  viewCounts: Record<'departments' | 'departments_inactive' | 'coupons' | 'active' | 'inactive' | 'exhausted', number>;
}

interface CustomersProjection {
  pagination: PlatformPagination;
  users: Array<{ id: string; name: string; email: string; createdAt: string; orderCount: number; shoppingListCount: number; lastOrder?: { displayId: number; status: string; createdAt: string } | null }>;
  /** Customers matching the current search and view. */
  totalCustomers: number;
  /** Every customer account in the store. */
  allCustomers: number;
  customersWithOrders: number;
  savedCarts: number;
}

interface PaymentsProjection {
  pagination: PlatformPagination;
  currencyCode: string;
  payments: Array<GroceryPlatformPayment & { paymentMethod?: string | null; createdAt: string; order: { id: string; displayId: number; status: string }; voidable: boolean; awaitingRevisedAuthorization: boolean }>;
  providers: Array<{ id: string; name: string; code: string; isInstalled: boolean; publicCheckout: boolean; runtimeConfigured: boolean }>;
  summary: { attentionCount: number; paymentCount: number; failedCount: number; processingCount: number; capturedCents: number; refundedCents: number; netCents: number; recovery: Record<string, number> };
  /** Restricted means the actor cannot see deployment provider configuration — not that none exists. */
  providerConfiguration: 'visible' | 'restricted';
  providerConfigurationEditable: boolean;
  /** Matching payments per view and status for the current search. */
  viewCounts: Record<string, number>;
  actorCanManageOrders: boolean;
}

interface SettingsProjection {
  store: { id: string; name: string; timezone: string; currencyCode: string; isActive: boolean };
  settings: { id: string; name: string; tagline: string; homepageTitle: string; homepageDescription: string; contactEmail: string; contactPhone: string; address: string; policyNotes?: string | null; logoUrl: string; logoIcon: string | null; logoColor: string; brandHue: number | null; currencyCode: string; taxRateBps: number; locale: string; timezone: string; countryCode: string; hours: Record<string, unknown>; isActive: boolean };
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
  orders: `query GroceryPlatformOrders($page:Int,$pageSize:Int,$search:String,$view:String,$sort:String,$orderId:ID) { groceryPlatformOrders(page:$page,pageSize:$pageSize,search:$search,view:$view,sort:$sort,orderId:$orderId) { currencyCode timezone view viewCounts actorCanRefund page pageSize totalOrders totalPages orders { id displayId email status deliveryDate deliveryTimeWindow substitutionPreference metadata createdAt currencyCode subtotalCents taxCents deliveryFeeCents discountCents totalCents lineItems { id title sku quantity unitPrice unitPriceCents thumbnail metadata product fulfillment } payments { id amountCents status providerPaymentId processedAt errorMessage providerCode refunds { id amountCents status reason requestedAt processedAt failureMessage reconciliationAttempts reconciliationNextAttemptAt reconciliationDeadLetterAt reconciliationLastError } } } salesSummary { todayOrders todayGrossCents thirtyDayOrders thirtyDayGrossCents thirtyDayRefundCents thirtyDayNetCents averageBasketCents } pending picking packed outForDelivery delivered } }`,
  fulfillment: `query GroceryPlatformFulfillment($page:Int,$pageSize:Int,$search:String,$view:String,$sort:String) { groceryPlatformFulfillment(page:$page,pageSize:$pageSize,search:$search,view:$view,sort:$sort) { pagination timezone view summary pending { id displayId email status deliveryDate deliveryTimeWindow substitutionPreference metadata lineItems { id quantity title sku metadata product fulfillment } } picking { id displayId email status deliveryDate deliveryTimeWindow substitutionPreference metadata lineItems { id quantity title sku metadata product fulfillment } } packed { id displayId email status deliveryDate deliveryTimeWindow substitutionPreference metadata lineItems { id quantity title sku metadata product fulfillment } } orderItemSubstitutions { id orderItem originalProduct substitutedProduct reason customerApproved approvedAt } } }`,
  delivery: `query GroceryPlatformDelivery($pageSize:Int,$search:String,$routeView:String,$routePage:Int,$readyPage:Int,$slotPage:Int,$slotView:String,$slotSort:String) { groceryPlatformDelivery(pageSize:$pageSize,search:$search,routeView:$routeView,routePage:$routePage,readyPage:$readyPage,slotPage:$slotPage,slotView:$slotView,slotSort:$slotSort) { timezone routeView routeViewCounts slotView slotSort pagination readyPagination slotPagination summary driversTruncated deliveryRoutes { id date timeWindow status stops startedAt completedAt driver { id name email } orders { id displayId status metadata } } readyOrders { id displayId email status deliveryDate deliveryTimeWindow metadata lineItems { id quantity } } drivers { id name email } deliverySlots { id date startTime endTime capacity currentBookings isActive deliveryFee } } }`,
  pickup: `query GroceryPlatformPickup($pageSize:Int,$search:String,$arrivalPage:Int,$stagedPage:Int,$slotPage:Int,$slotView:String,$slotSort:String) { groceryPlatformPickup(pageSize:$pageSize,search:$search,arrivalPage:$arrivalPage,stagedPage:$stagedPage,slotPage:$slotPage,slotView:$slotView,slotSort:$slotSort) { slotView slotSort pagination stagedPagination slotPagination summary pickupSlots { id date startTime endTime maxOrders currentOrders isAvailable } parkingSpots { id spotNumber description isAccessible isAvailable } occupiedSpotIds arrivals { id displayId email status metadata } stagedOrders { id displayId email status metadata } } }`,
  inventory: `query GroceryPlatformInventory($page:Int,$pageSize:Int,$search:String,$status:String,$view:String,$sort:String) { groceryPlatformInventory(page:$page,pageSize:$pageSize,search:$search,status:$status,view:$view,sort:$sort) { pagination products { id title sku stockQuantity recordedStockQuantity lowStockThreshold inStock activeBackInStockAlerts department unitOfMeasure supplier { id name } } inventoryLots { id lotNumber expirationDate quantity quantityRemaining safetyStatus conditionStatus location isExpired isExpiringSoon product { id title unitOfMeasure } supplier { id name } } lotViewCounts } }`,
  suppliers: `query GroceryPlatformSuppliers($page:Int,$pageSize:Int,$search:String,$status:String,$view:String,$sort:String) { groceryPlatformSuppliers(page:$page,pageSize:$pageSize,search:$search,status:$status,view:$view,sort:$sort) { pagination currencyCode suppliers { id name contactName email phone paymentTerms deliveryDays minimumOrder minimumOrderCents productCount purchaseOrderCount openPurchaseOrderCount products { id } purchaseOrders { id status } } viewCounts openPurchaseOrders } }`,
  purchasing: `query GroceryPlatformPurchasing($page:Int,$pageSize:Int,$search:String,$status:String,$view:String,$sort:String,$supplierId:ID) { groceryPlatformPurchasing(page:$page,pageSize:$pageSize,search:$search,status:$status,view:$view,sort:$sort,supplierId:$supplierId) { pagination currencyCode statusCounts dueSoonCount openCommittedCents purchaseOrders { id poNumber orderDate expectedDeliveryDate status totalAmount totalAmountCents notes isDueSoon supplier { id name } items { id productTitle productSku quantity quantityReceived unitCost unitCostCents } } } }`,
  purchasingOptions: `query GroceryPurchasingOptions($kind:String!,$search:String!) { groceryPurchasingOptions(kind:$kind,search:$search) { id name title } }`,
  merchandising: `query GroceryPlatformMerchandising($page:Int,$pageSize:Int,$search:String,$status:String,$view:String,$sort:String) { groceryPlatformMerchandising(page:$page,pageSize:$pageSize,search:$search,status:$status,view:$view,sort:$sort) { pagination currencyCode viewCounts departments { id name handle description imageUrl sortOrder isActive temperatureZone requiredLicenses productCount products { id } } coupons { id code discountType discountValue discountValueCents minPurchase minPurchaseCents maxUses currentUses productCategories categoryRestrictionValid isActive validFrom validTo } } }`,
  customers: `query GroceryPlatformCustomers($page:Int,$pageSize:Int,$search:String,$status:String,$view:String,$sort:String) { groceryPlatformCustomers(page:$page,pageSize:$pageSize,search:$search,status:$status,view:$view,sort:$sort) { pagination users { id name email createdAt orderCount shoppingListCount lastOrder { displayId status createdAt } } totalCustomers allCustomers customersWithOrders savedCarts } }`,
  payments: `query GroceryPlatformPayments($page:Int,$pageSize:Int,$search:String,$status:String,$view:String,$sort:String) { groceryPlatformPayments(page:$page,pageSize:$pageSize,search:$search,status:$status,view:$view,sort:$sort) { pagination currencyCode payments { id amountCents status paymentMethod providerPaymentId providerCode processedAt createdAt errorMessage order { id displayId status } refunds { id amountCents status reason requestedAt processedAt failureMessage reconciliationAttempts reconciliationNextAttemptAt reconciliationDeadLetterAt reconciliationLastError } voidable awaitingRevisedAuthorization } providers { id name code isInstalled publicCheckout runtimeConfigured } summary { attentionCount paymentCount failedCount processingCount capturedCents refundedCents netCents recovery } providerConfiguration providerConfigurationEditable viewCounts actorCanManageOrders } }`,
  settings: `query GroceryPlatformSettings { groceryPlatformSettings { store { id name timezone currencyCode isActive } settings { id name tagline homepageTitle homepageDescription contactEmail contactPhone address policyNotes logoUrl logoIcon logoColor brandHue currencyCode taxRateBps locale timezone countryCode hours deliveryPolicy isActive } counts { products suppliers deliverySlots pickupSlots parkingSpots } } }`,
} as const;

export const platformProjections = {
  orders: (page = 1, pageSize = 50, options: { search?: string; view?: string; sort?: string; orderId?: string } = {}) => readProjection<OrdersProjection>(platformProjectionQueries.orders, 'groceryPlatformOrders', { page, pageSize, search: options.search || '', view: options.view || 'active', sort: options.sort || 'newest', orderId: options.orderId || null }),
  fulfillment: (page=1,pageSize=50,search="",view="",sort="") => readProjection<FulfillmentProjection>(platformProjectionQueries.fulfillment, 'groceryPlatformFulfillment',{page,pageSize,search,view:view||null,sort:sort||null}),
  delivery: (options: { search?: string; routeView?: string; routePage?: number; readyPage?: number; slotPage?: number; slotView?: string; slotSort?: string } = {}) => readProjection<DeliveryProjection>(platformProjectionQueries.delivery, 'groceryPlatformDelivery', { pageSize: 50, search: options.search || '', routeView: options.routeView || null, routePage: options.routePage || 1, readyPage: options.readyPage || 1, slotPage: options.slotPage || 1, slotView: options.slotView || null, slotSort: options.slotSort || null }),
  pickup: (options: { search?: string; arrivalPage?: number; stagedPage?: number; slotPage?: number; slotView?: string; slotSort?: string } = {}) => readProjection<PickupProjection>(platformProjectionQueries.pickup, 'groceryPlatformPickup', { pageSize: 50, search: options.search || '', arrivalPage: options.arrivalPage || 1, stagedPage: options.stagedPage || 1, slotPage: options.slotPage || 1, slotView: options.slotView || null, slotSort: options.slotSort || null }),
  inventory: (page=1,pageSize=50,search="",status="",view="",sort="") => readProjection<InventoryProjection>(platformProjectionQueries.inventory, 'groceryPlatformInventory',{page,pageSize,search,status,view:view||null,sort:sort||null}),
  suppliers: (page=1,pageSize=50,search="",status="",view="",sort="") => readProjection<SuppliersProjection>(platformProjectionQueries.suppliers, 'groceryPlatformSuppliers',{page,pageSize,search,status,view:view||null,sort:sort||null}),
  purchasing: (page=1,pageSize=50,search="",status="",view="",sort="",supplierId="") => readProjection<PurchasingProjection>(platformProjectionQueries.purchasing, 'groceryPlatformPurchasing',{page,pageSize,search,status,view:view||null,sort:sort||null,supplierId:supplierId||null}),
  purchasingOptions: (kind: 'supplier' | 'product', search = '') => readProjection<PurchasingOption[]>(platformProjectionQueries.purchasingOptions, 'groceryPurchasingOptions', { kind, search }),
  merchandising: (page=1,pageSize=50,search="",status="",view="",sort="") => readProjection<MerchandisingProjection>(platformProjectionQueries.merchandising, 'groceryPlatformMerchandising',{page,pageSize,search,status,view:view||null,sort:sort||null}),
  customers: (page=1,pageSize=50,search="",status="",view="",sort="") => readProjection<CustomersProjection>(platformProjectionQueries.customers, 'groceryPlatformCustomers',{page,pageSize,search,status,view:view||null,sort:sort||null}),
  payments: (page=1,pageSize=50,search="",status="",view="",sort="") => readProjection<PaymentsProjection>(platformProjectionQueries.payments, 'groceryPlatformPayments',{page,pageSize,search,status,view:view||null,sort:sort||null}),
  settings: () => readProjection<SettingsProjection>(platformProjectionQueries.settings, 'groceryPlatformSettings'),
};
