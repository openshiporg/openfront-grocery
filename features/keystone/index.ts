import { s3ForcePathStyle } from "./lib/s3-storage";
import { createAuth } from "@keystone-6/auth";
import { config } from "@keystone-6/core";
import "dotenv/config";
import { models } from "./models";
import { statelessSessions } from "@keystone-6/core/session";
import { extendGraphqlSchema } from "./mutations";
import { sendPasswordResetEmail } from "./lib/mail";
import { publicError } from "./lib/publicError";
import { permissions } from "./access";
import { getCanonicalSiteUrl, getDatabaseUrl, getPublicStoreId, getSessionMaxAge, getSessionSecret, getStorageConfig, isProduction } from './lib/runtimeConfig';
import { boundedGraphqlDepthRule, rejectIntrospectionInProduction } from './lib/graphqlSecurity';
import { extendPrismaClientWithErrorNormalization } from './utils/serializableTransaction';
import { resolveApplicationOrigin } from '../../lib/applicationOrigin';

const databaseURL = getDatabaseUrl();
// Optional payment providers are checked when used (discovery, new payments), not at startup.
const publicStoreId = getPublicStoreId();
const production = isProduction();
const canonicalSiteUrl = production ? getCanonicalSiteUrl() : null;

function passwordResetOrigin(context: { req?: { headers?: Record<string, string | string[] | undefined> } }) {
  const requestHeaders = context.req?.headers;
  return resolveApplicationOrigin({
    nodeEnv: production ? 'production' : 'development',
    canonicalSiteUrl: canonicalSiteUrl || undefined,
    headers: requestHeaders ? {
      get(name: string) {
        const value = requestHeaders[name.toLowerCase()];
        return Array.isArray(value) ? value.join(',') : value || null;
      },
    } : null,
  });
}

const sessionConfig = {
  maxAge: getSessionMaxAge(),
  secret: getSessionSecret(),
  secure: isProduction(),
  sameSite: 'lax' as const,
};

const { bucketName, region, accessKeyId, secretAccessKey, endpoint } = getStorageConfig();

const { withAuth } = createAuth({
  listKey: "User",
  identityField: "email",
  secretField: "password",
  initFirstItem: {
    fields: ["name", "email", "password"],
    itemData: {
      store: { connect: { id: publicStoreId } },
      role: {
        create: {
          store: { connect: { id: publicStoreId } },
          name: "Admin",
          canManageProducts: true,
          canManageOrders: true,
          canManageInventory: true,
          canManageSuppliers: true,
          canManageDelivery: true,
          canManageUsers: true,
          canManagePayments: true,
          canManageOnboarding: true,
          canAccessDashboard: true,
        },
      },
    },
  },
  passwordResetLink: {
    async sendToken(args) {
      // Staff reset on the dashboard; shoppers (no dashboard access) reset on the storefront.
      const account = await args.context.prisma.user.findUnique({ where: { id: String(args.itemId) }, select: { role: { select: { canAccessDashboard: true } } } }).catch(() => null);
      const resetPath = account?.role?.canAccessDashboard ? '/dashboard/reset' : '/account/reset';
      try {
        await sendPasswordResetEmail(args.token, args.identity, passwordResetOrigin(args.context), resetPath);
      } catch {
        throw publicError('The reset email could not be sent. Try again later or contact the store.', 'EMAIL_SEND_FAILED');
      }
    },
  },
  sessionData: `
    name
    email
    store { id code name }
    role {
      id
      name
      canManageProducts
      canManageOrders
      canManageInventory
      canManageSuppliers
      canManageDelivery
      canManageUsers
      canManagePayments
      canManageOnboarding
      canAccessDashboard
    }
  `,
});

export default withAuth(
  config({
    db: {
      provider: "postgresql",
      url: databaseURL,
      extendPrismaClient: extendPrismaClientWithErrorNormalization,
    },
    lists: models,
    storage: {
      my_images: {
        kind: "s3",
        type: "image",
        bucketName,
        region,
        accessKeyId,
        secretAccessKey,
        endpoint,
        signed: { expiry: 5000 },
        forcePathStyle: s3ForcePathStyle(endpoint),
      },
    },
    ui: {
      // UI visibility is not authorization; List/custom operation access below
      // resolves current capabilities from the database.
      isAccessAllowed: ({ session }) => session?.data.role?.canAccessDashboard ?? false,
    },
    session: statelessSessions(sessionConfig),
    graphql: {
      extendGraphqlSchema,
      playground: !production,
      debug: !production,
      bodyParser: { limit: '1mb' },
      cors: { origin: canonicalSiteUrl || true, credentials: true },
      apolloConfig: {
        validationRules: [boundedGraphqlDepthRule, rejectIntrospectionInProduction],
      },
    },
  })
);