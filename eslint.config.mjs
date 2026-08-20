import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [
  ...nextVitals,
  // Keystone's vendored dashboard/document-editor UI is upstream code. Keep it
  // out of the Grocery lint gate; Grocery platform/storefront code remains linted.
  {
    ignores: [
      '.next*/**',
      'test-results/**',
      'features/dashboard/**',
      'components/ui/sidebar.tsx',
      'components/ui/theme-switcher.tsx',
    ],
  },
];

export default eslintConfig;
