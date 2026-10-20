'use client';

import { MarketBasketProvider } from '../modules/market/MarketBasket';
import QueryProvider from '../lib/providers/query-client-provider';
import { configureStorefrontMoney } from '../lib/marketFormatting';

interface StorefrontServerProps {
  children: React.ReactNode;
  /** Server-derived shopper identity: "guest" or the signed-in user id. */
  shopperIdentity: string;
  /** The Store's currency and locale for money shown in the shop. */
  currencyCode?: string | null;
  locale?: string | null;
  prefetchProducts?: {
    departmentId?: string;
    limit?: number;
  };
  prefetchUser?: boolean;
  prefetchCart?: boolean;
  prefetchDepartments?: boolean;
}

export default function StorefrontServer({ children, shopperIdentity, currencyCode, locale }: StorefrontServerProps) {
  configureStorefrontMoney(currencyCode, locale);
  return <QueryProvider key={shopperIdentity}><MarketBasketProvider identity={shopperIdentity}>{children}</MarketBasketProvider></QueryProvider>;
}
