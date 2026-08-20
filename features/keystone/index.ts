import { createAuth } from "@keystone-6/auth";
import { config } from "@keystone-6/core";
import "dotenv/config";
import { models } from "./models";
import { statelessSessions } from "@keystone-6/core/session";
import { extendGraphqlSchema } from "./mutations";
import { sendPasswordResetEmail } from "./lib/mail";
import { permissions } from "./access";
import { assertProductionPaymentConfig, getCanonicalSiteUrl, getDatabaseUrl, getPublicStoreId, getSessionMaxAge, getSessionSecret, getStorageConfig, isProduction } from './lib/runtimeConfig';
import { boundedGraphqlDepthRule, rejectIntrospectionInProduction } from './lib/graphqlSecurity';
import { graphqlRateLimitPlugin } from './lib/graphqlRateLimit';
import { resolveApplicationOrigin } from '../../lib/applicationOrigin';

const databaseURL = getDatabaseUrl();
assertProductionPaymentConfig();
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
      await sendPasswordResetEmail(args.token, args.identity, passwordResetOrigin(args.context));
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
        forcePathStyle: true,
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
        plugins: [graphqlRateLimitPlugin()],
      },
    },
  })
);