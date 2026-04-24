import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="mt-16 border-t border-emerald-950/8 bg-[linear-gradient(180deg,rgba(249,247,241,1),rgba(244,249,242,1))]">
      <div className="max-w-[1440px] mx-auto px-6 py-12">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.2fr_1fr_1fr_1fr]">
          <div className="max-w-md">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-emerald-700/80">
              Openfront Grocery
            </p>
            <h3 className="mt-3 text-2xl font-semibold text-zinc-950">
              Built for merchants who own the basket, the slot, and the customer relationship.
            </h3>
            <p className="mt-4 text-sm leading-7 text-zinc-600">
              A grocery storefront should feel like a real local operation: fresh catalog, clear fulfillment promises, and fewer surprises during pickup or delivery.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-zinc-950 mb-4">Shop</h3>
            <ul className="space-y-2 text-sm text-zinc-600">
              <li><Link href="/departments/produce" className="hover:text-zinc-950">Produce</Link></li>
              <li><Link href="/departments/meat-seafood" className="hover:text-zinc-950">Meat & Seafood</Link></li>
              <li><Link href="/departments/dairy" className="hover:text-zinc-950">Dairy & Eggs</Link></li>
              <li><Link href="/departments/bakery" className="hover:text-zinc-950">Bakery</Link></li>
              <li><Link href="/departments/frozen" className="hover:text-zinc-950">Frozen</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-zinc-950 mb-4">Fulfillment</h3>
            <ul className="space-y-2 text-sm text-zinc-600">
              <li><Link href="/cart" className="hover:text-zinc-950">Reserve a slot</Link></li>
              <li><Link href="/deals" className="hover:text-zinc-950">Weekly deals</Link></li>
              <li><Link href="/lists" className="hover:text-zinc-950">Saved lists</Link></li>
              <li><Link href="/subscriptions" className="hover:text-zinc-950">Repeat orders</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-zinc-950 mb-4">Account</h3>
            <ul className="space-y-2 text-sm text-zinc-600">
              <li><Link href="/account" className="hover:text-zinc-950">My account</Link></li>
              <li><Link href="/account" className="hover:text-zinc-950">Order history</Link></li>
              <li><Link href="/dashboard/signin?from=/account" className="hover:text-zinc-950">Sign in</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-emerald-950/8 pt-6 text-sm text-zinc-500 md:flex-row md:items-center md:justify-between">
          <p>&copy; {new Date().getFullYear()} Openfront Grocery</p>
          <p>Fresh catalog. Clear substitutions. Fulfillment-ready checkout.</p>
        </div>
      </div>
    </footer>
  );
}
