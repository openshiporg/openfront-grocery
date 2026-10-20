import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  reactCompiler: true,
  // Shopper accounts live in the storefront (/account/*). Signed-out visits to the shared staff
  // auth pages that came from a storefront page (old links or bookmarks), and dashboard sign-up
  // while public dashboard sign-up is off, go to the storefront account pages. Query strings pass
  // through, so the return path is kept.
  async redirects() {
    const signedOut = [{ type: 'cookie' as const, key: 'keystonejs-session' }];
    return [
      { source: '/dashboard/signin', has: [{ type: 'query' as const, key: 'from', value: '/(?!dashboard)(?!/).*' }], missing: signedOut, destination: '/account/sign-in', permanent: false },
      ...(process.env.PUBLIC_SIGNUPS_ALLOWED === 'true' ? [] : [{ source: '/dashboard/signup', missing: signedOut, destination: '/account/register', permanent: false }]),
    ];
  },
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        { key: 'Content-Security-Policy', value: "base-uri 'self'; frame-ancestors 'none'; object-src 'none'" },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
      ],
    }];
  },
  serverExternalPackages: ['graphql'],
  // Workaround since we diverged from Keystone reltionship and document views
  // typescript: {
  //   ignoreBuildErrors: true,
  // },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: process.env.S3_ENDPOINT ? process.env.S3_ENDPOINT.replace(/^https?:\/\//, '').replace(/:\d+$/, '') : '/',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;