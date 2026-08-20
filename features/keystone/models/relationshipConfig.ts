/**
 * Keystone relationships are nullable by default. Operational ownership and
 * evidence relations opt into Prisma-required fields so the generated schema
 * and database migration retain the same invariant.
 */
export function requiredRelationshipPrisma(field: string) {
  return field
    .replace(/(\b\w+\s+\w+)\?(\s+@relation)/, '$1$2')
    .replace(/(\n\s*\w+Id\s+\w+)\?(\s+@map)/, '$1$2');
}

/** Optional one-to-one identity, used where null is valid but duplicates are not. */
export function uniqueRelationshipPrisma(field: string) {
  return field.replace(
    /(\n\s*\w+Id\s+\w+\?[^\n]*)(\n|$)/,
    (_match, scalarLine: string, ending: string) => `${scalarLine.trimEnd()} @unique${ending}`,
  );
}

/** Required one-to-one ownership, used by one settings row per Store. */
export function requiredUniqueRelationshipPrisma(field: string) {
  return requiredRelationshipPrisma(field).replace(
    /(\n\s*\w+Id\s+\w+[^\n]*)(\n|$)/,
    (_match, scalarLine: string, ending: string) => `${scalarLine.trimEnd()} @unique${ending}`,
  );
}
