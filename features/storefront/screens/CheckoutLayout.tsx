import Logo from "@/features/storefront/modules/layout/components/logo"

export async function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="h-16 border-b border-border">
        <nav className="max-w-[1440px] mx-auto px-6 flex items-center justify-between h-full">
          <Logo />
          <span className="text-sm text-muted-foreground">Secure Checkout</span>
        </nav>
      </header>
      {children}
    </div>
  )
}
