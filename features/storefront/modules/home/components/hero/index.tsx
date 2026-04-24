interface HeroProps {
  title?: string;
  description?: string;
}

export default function Hero({ title, description }: HeroProps) {
  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-emerald-950/8 bg-[linear-gradient(135deg,rgba(242,250,239,0.98),rgba(251,248,241,0.98),rgba(255,242,216,0.94))] px-6 py-10 shadow-[0_34px_80px_-52px_rgba(18,56,34,0.75)] md:px-10 md:py-14">
      <div className="absolute -left-14 top-10 h-40 w-40 rounded-full bg-emerald-200/35 blur-3xl" />
      <div className="absolute right-0 top-0 h-52 w-52 rounded-full bg-amber-200/35 blur-3xl" />

      <div className="relative grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-900/10 bg-white/75 px-4 py-2 text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-emerald-900/80">
            <span className="h-2 w-2 rounded-full bg-emerald-600" />
            Grocery built for delivery slots, substitutions, and curbside pickup
          </div>

          <h1 className="mt-5 max-w-[14ch] text-4xl font-semibold leading-[0.98] tracking-tight text-zinc-950 md:text-6xl">
            {title || 'Fresh groceries that feel planned, not improvised.'}
          </h1>

          <p className="mt-5 max-w-xl text-base leading-7 text-zinc-700 md:text-lg">
            {description || 'Browse a neighborhood-ready catalog, fill your basket fast, choose the right handoff window, and keep substitutions clear before the picking team ever starts.'}
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a
              href="/products"
              className="inline-flex items-center justify-center rounded-full bg-emerald-700 px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-800"
            >
              Shop the full catalog
            </a>
            <a
              href="/deals"
              className="inline-flex items-center justify-center rounded-full border border-emerald-900/10 bg-white/70 px-6 py-3.5 text-sm font-semibold text-zinc-900 transition-colors hover:bg-white"
            >
              See weekly deals
            </a>
          </div>

          <dl className="mt-8 grid gap-3 sm:grid-cols-3">
            {[
              ['2-hour pickup windows', 'Reserve a handoff slot that fits the trip you are already making.'],
              ['Clear substitutions', 'Set expectations before the picker starts building your order.'],
              ['Cold-chain aware', 'Fresh, chilled, and frozen products stay separated by workflow.'],
            ].map(([label, text]) => (
              <div key={label} className="rounded-[1.25rem] border border-emerald-950/8 bg-white/72 p-4">
                <dt className="text-sm font-semibold text-zinc-950">{label}</dt>
                <dd className="mt-2 text-sm leading-6 text-zinc-600">{text}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="relative">
          <div className="grid grid-cols-2 gap-4">
            <div className="overflow-hidden rounded-[1.75rem] border border-white/70 bg-white/80 shadow-[0_24px_45px_-40px_rgba(18,56,34,0.65)]">
              <img
                src="https://images.unsplash.com/photo-1542838132-92c53300491e?w=900&h=1100&fit=crop"
                alt="Fresh produce arranged in crates"
                className="h-72 w-full object-cover"
              />
            </div>
            <div className="mt-10 overflow-hidden rounded-[1.75rem] border border-white/70 bg-white/80 shadow-[0_24px_45px_-40px_rgba(18,56,34,0.65)]">
              <img
                src="https://images.unsplash.com/photo-1518843875459-f738682238a6?w=900&h=1100&fit=crop"
                alt="Paper grocery bag with vegetables and citrus"
                className="h-72 w-full object-cover"
              />
            </div>
          </div>
          <div className="absolute -bottom-4 left-6 max-w-[16rem] rounded-[1.5rem] border border-emerald-950/10 bg-zinc-950 px-5 py-4 text-zinc-50 shadow-[0_24px_45px_-35px_rgba(12,24,18,0.85)]">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-emerald-300/90">Fulfillment note</p>
            <p className="mt-2 text-sm leading-6 text-zinc-200">
              Picking-friendly grocery UX means fewer last-minute calls, cleaner routes, and happier repeat customers.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
