import CheckoutTemplate from "@/features/storefront/modules/checkout/templates"
import { retrieveCart } from "@/features/storefront/lib/data/cart"
import { getUser } from "@/features/storefront/lib/data/user"
import { listPaymentProviders } from '@/features/storefront/lib/data/payment'

export const metadata = {
  title: "Checkout",
  description: "Complete your order",
}

export async function CheckoutPage() {
  const [cart, user, paymentProviders] = await Promise.all([
    retrieveCart(),
    getUser(),
    listPaymentProviders(),
  ])

  return <CheckoutTemplate cart={cart} user={user} paymentProviders={paymentProviders} />
}
