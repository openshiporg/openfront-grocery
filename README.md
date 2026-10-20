![Openfront Grocery](https://openship.org/og/openfront-grocery.png)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fopenshiporg%2Fopenfront-grocery&env=DATABASE_URL%2CSESSION_SECRET%2CPUBLIC_STORE_ID%2CNEXT_PUBLIC_SITE_URL%2CS3_BUCKET_NAME%2CS3_REGION%2CS3_ENDPOINT%2CS3_ACCESS_KEY_ID%2CS3_SECRET_ACCESS_KEY)

Openfront Grocery is a self-hostable grocery storefront and store-operations platform. Shoppers can browse departments and products, build carts and lists, choose pickup or delivery, and manage orders and subscriptions. Store teams use the dashboard for merchandising, fresh inventory, purchasing, picking, substitutions, handoff, payments, and customer service.

## Demo

![Produce-market image used by the Grocery storefront](public/images/produce-market.jpg)

| | |
|---|---|
| **Demo name** | Juniper Market |
| **Product** | [Openfront Grocery](https://openship.org/products/openfront-grocery) |
| **Storefront** | [juniper.openship.org](https://juniper.openship.org) |
| **Dashboard** | [juniper.openship.org/dashboard](https://juniper.openship.org/dashboard) |
| **User** | `juniper@openship.org` |
| **Password** | `48dUYWcxNparnRLHFZKY` |

[Learn more →](https://openship.org/products/openfront-grocery)

[Documentation →](https://docs.openship.org/docs/openfront/grocery/)

## The Openfront Ecosystem

Openfront is part of an ecosystem of open-source commerce tools:

- **[Openfront E-commerce](https://github.com/openshiporg/openfront)**: Headless e-commerce for retail.
- **[Openfront Restaurant](https://github.com/openshiporg/openfront-restaurant)**: Restaurant ordering, point of sale, and kitchen operations.
- **[Openship](https://github.com/openshiporg/openship)**: Order routing for multi-channel fulfillment.
- **Openfront Grocery**: (This repository) Grocery shopping, fresh inventory, and local fulfillment.

## Core Features

### Admin Dashboard
Manage products, departments, orders, customers, suppliers, and purchasing. Dedicated workspaces cover inventory, fulfillment, pickup, delivery, payments, merchandising, subscriptions, communications, staff, and reports.

### Storefront
Shoppers can browse products, departments, and deals, manage a cart, and check out for pickup or delivery. Account pages include orders, addresses, profile, and privacy requests. Shopping lists, favorites, and recurring subscriptions support repeat shopping.

### Fresh Inventory & Purchasing
- Lot inventory, stock movements, adjustments, counts, expiry, and recalls.
- Case conversion and product-information version records.
- Supplier records, purchase-order drafts, receiving, invoices, and credits.
- Inventory allocations linked to order lines.

### Pickup, Delivery & Substitutions
Pickup and delivery slots track fulfillment capacity. Staff manage picking, substitutions, packing, curbside check-in, parking, handoff, delivery routes, and returned-delivery rescheduling. Order-line fulfillment and settlement records preserve actual quantities and substitution outcomes.

### Payments & Customer Retention
Stripe is the built-in public checkout adapter when enabled and configured. Payment sessions, signed webhook events, refunds, settlement matching, and financial closes support payment operations. Coupons, loyalty records, notification preferences, and subscriptions support customer retention.

## Architecture

### Technology Stack
- **Frontend**: Next.js 16 with App Router and React 19.
- **Backend**: KeystoneJS 6 with a GraphQL API.
- **Database**: PostgreSQL with Prisma ORM.
- **Styling**: Tailwind CSS 4 with shared shadcn/ui components.
- **Authentication**: Session-based with role-based permissions.

### Application Structure
```text
openfront-grocery/
├── app/
│   ├── (storefront)/        # Shopping, checkout, account, and order pages
│   ├── dashboard/          # Store workspaces and first-admin setup
│   └── api/                # Health, payment, and optional AI/MCP endpoints
├── features/
│   ├── keystone/           # Models, access, commands, and projections
│   ├── platform/           # Store operations and onboarding
│   ├── storefront/         # Shopper components and screens
│   └── integrations/       # Payments, events, and communications
├── scripts/                # Event, subscription, and refund workers
└── components/             # Shared UI components
```

### Data Models
The [Keystone model registry](features/keystone/models/index.ts) and [Prisma schema](schema.prisma) cover:

- Stores, settings, users, roles, staff invitations, and access events.
- Departments, products, suppliers, purchase orders, receipts, invoices, and credits.
- Inventory lots, allocations, movements, adjustments, counts, recalls, and conversions.
- Carts, cart items, checkout attempts, orders, order lines, and substitutions.
- Pickup slots, delivery slots, parking spots, and delivery routes.
- Payments, sessions, refunds, webhook events, settlements, and financial closes.
- Coupons, loyalty, lists, favorites, recipes, subscriptions, customer messages, and privacy requests.

## Getting Started

### Prerequisites
- Node.js 20.9 or later, compatible with Next.js 16.
- A PostgreSQL database you can migrate.
- npm.

### Setup

1. **Clone and install dependencies:**
   ```bash
   git clone https://github.com/openshiporg/openfront-grocery.git
   cd openfront-grocery
   npm install
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```

   Update `.env` with your database and newly generated secrets:
   ```env
   DATABASE_URL=postgresql://user:password@host/database
   SESSION_SECRET=replace-with-a-new-random-value-of-at-least-32-characters
   PUBLIC_STORE_ID=store_juniper
   PUBLIC_SIGNUPS_ALLOWED=false
   STRIPE_ENABLED=false
   MCP_ENABLED=false
   ```

   Generate each secret separately, for example with `openssl rand -hex 32`. Do not use the placeholder text as a secret.

   For local development, remove the template's placeholder `NEXT_PUBLIC_SITE_URL` and internal infrastructure placeholders unless you supply working values. Production requires `NEXT_PUBLIC_SITE_URL` as the deployed HTTPS origin, `PUBLIC_STORE_ID=store_juniper`, and the complete S3 configuration. Configure SMTP for email. Enable Stripe only after supplying its secret key, publishable key, and webhook secret. `SHADOW_DATABASE_URL` is for migration development, not normal application startup.

   Replace URL examples and internal routing overrides with your actual application origin, or remove optional overrides you do not need. Never commit your `.env` file.

3. **Start development server:**
   ```bash
   npm run dev
   ```

   This builds Keystone, applies checked-in database migrations, and starts Next.js.

4. **Access the application:**
   Open the URL `npm run dev` prints, then use these paths:

   - **Storefront**: `/`
   - **Store dashboard**: `/dashboard`
   - **Customer account**: `/account`
   - **GraphQL API**: `/api/graphql`

5. **Create your first admin user:**
   Visit `/dashboard/init` on that application URL to create the initial administrator.

6. **Run store onboarding:**
   Use dashboard onboarding to create the store's catalog, suppliers, inventory, and fulfillment settings. Review pickup and delivery capacity, payment providers, and storefront settings before accepting orders.

## Development Commands

- `npm run dev` - Build Keystone, apply migrations, and start Next.js development.
- `npm run build` - Build Keystone and Next.js for production; does not apply migrations.
- `npm start` - Start the production Next.js server.
- `npm run migrate:gen` - Build Keystone, generate view ordering, and generate/apply development migrations.
- `npm run migrate` - Apply checked-in Prisma migrations.
- `npm run lint` - Run ESLint.
- `npm run worker:events` - Run the grocery event worker.
- `npm run worker:subscriptions` - Run the recurring-order worker.
- `npm run worker:refund-reconcile` - Run the refund-reconciliation worker.
- `npm run worker:refund-reconcile:once` - Run one refund-reconciliation pass.

Use a development database for `migrate:gen`; it generates and applies schema changes.

### Payment Integration
[Payment adapters](features/integrations/payment/index.ts) register Stripe for public checkout and a separate local test adapter. Custom remote operations require an explicitly allowed HTTPS origin. Configure Stripe using [`.env.example`](.env.example); test adapters are not production checkout providers.

### Fulfillment Integration
[Order-line fulfillment](features/keystone/mutations/resolveOrderLineFulfillment.ts), delivery-route commands, and pickup actions coordinate store work through controlled mutations. Event, subscription, and refund workers need the store-scoped operator IDs documented in `.env.example`.

## Documentation

See the [Openfront Grocery documentation](https://docs.openship.org/docs/openfront/grocery/) for the vertical's application guide, data model, access boundaries, and integration notes. The [source models](features/keystone/models) and [business commands](features/keystone/mutations) describe the implementation in this repository.

## Security & Permissions

### Role-Based Access Control
- `canAccessDashboard` - Store dashboard access.
- `canManageProducts` - Catalog and merchandising.
- `canManageOrders` - Order and fulfillment operations.
- `canManageInventory` - Inventory operations.
- `canManageSuppliers` - Suppliers and purchasing.
- `canManageDelivery` - Delivery operations.
- `canManagePayments` - Payments and refunds.
- `canManageUsers` - Staff and customer administration.

### Security Features
- Session-based authentication and store-scoped operations.
- Privileged capabilities rechecked against current database state.
- Customer ownership checks for carts, accounts, and orders.
- Token-checked guest order access.
- Stripe webhook verification and recorded payment-event identity.
- Production GraphQL depth limits and disabled public introspection.

The current public store is the migrated `store_juniper` store; settings are singleton records, not an organization/location tenant hierarchy.

## Platform Components

### Admin Platform (`/dashboard`)
- **Catalog & merchandising**: Products, departments, promotions, and product information.
- **Orders & fulfillment**: Picking, substitutions, packing, and handoff.
- **Inventory & purchasing**: Lots, expiry, counts, recalls, receipts, and suppliers.
- **Pickup & delivery**: Slots, curbside check-in, parking, and delivery routes.
- **Payments & reports**: Refunds, settlements, reconciliation, and financial closes.
- **Customers & staff**: Accounts, subscriptions, communications, and staff access.

### Storefront Experience
- **Product discovery**: Departments, products, and deals.
- **Shopping**: Cart, favorites, lists, and substitution preferences.
- **Checkout**: Pickup or delivery selection and configured Stripe payment.
- **Account management**: Order history, addresses, profile, privacy requests, and subscriptions.

## Deployment

### Production Deployment
The Vercel button imports this repository. Provision PostgreSQL and configure the environment, storage, and any enabled integrations separately.

Build the application, apply migrations as a release step, and start the production server:

```bash
npm run build
npm run migrate
npm start
```

Back up an existing database before applying migrations. The included [`railway.toml`](railway.toml) builds without migrations and applies them when the application starts.

### Scaling Considerations
Run the event, subscription, and refund workers as separate supervised processes when those workflows are enabled. Supply their store-scoped operator identities and use the shared PostgreSQL database and object storage. Recurring orders and external event delivery depend on those workers, not just the web process.

## Contributing

Use the development commands above when preparing changes. Keep model changes and their migrations together, and describe any workflow or permission changes in your pull request.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).

## Support

- **Documentation**: [Openfront Grocery guide](https://docs.openship.org/docs/openfront/grocery/).
- **Issues**: [Report bugs and feature requests](https://github.com/openshiporg/openfront-grocery/issues).
- **Product**: [Learn more about Openfront Grocery](https://openship.org/products/openfront-grocery).

---

Built with [Next.js](https://nextjs.org) and [KeystoneJS](https://keystonejs.com).
