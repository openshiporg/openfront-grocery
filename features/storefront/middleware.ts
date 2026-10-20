import { NextResponse } from "next/server";
import { NextRequest } from "next/server";

// Grocery's storefront hook for the shared proxy (Restaurant pattern). Grocery has no region
// routing or URL cart hand-off: carts and guest orders use HttpOnly cookies set by server actions.
export async function handleStorefrontRoutes(_request: NextRequest, _user: any | null) {
  return NextResponse.next();
}
