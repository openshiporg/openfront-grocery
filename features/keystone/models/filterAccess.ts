import { permissions } from '../access';

/**
 * Where-filters and ordering are an oracle: a count over `relation { field: { startsWith } }` reveals values the
 * caller cannot read. Every field is therefore filterable/orderable only when the caller could read it, and a
 * relation only when the caller could read the related list rows without an owner restriction.
 */

// Never filterable or orderable for anyone: secrets, tokens, hashes, provider blobs.
const NEVER = new Set([
  'password', 'tokenHash', 'claimToken', 'reconciliationToken', 'reconciliationLastError', 'passwordResetToken',
  'passwordResetIssuedAt', 'passwordResetRedeemedAt', 'providerData', 'providerEvidence', 'credentials',
  'verifiedPayload', 'replayAudit', 'skuIdentity', 'sessionKey',
]);

// Accounts are readable only as oneself, but staff reach them through relations (order.user): the personal
// fields are filterable only for user administrators.
const USER_PERSONAL = new Set(['name', 'email', 'onboardingStatus', 'privacyErasedAt']);

async function passes(rule: unknown, args: any) {
  if (typeof rule === 'boolean') return rule;
  if (typeof rule !== 'function') return true;
  try { return Boolean(await (rule as any)(args)); } catch { return false; }
}

export function hardenFilterAccess<T extends Record<string, any>>(lists: T): T {
  const readableRelation = async (target: string, ctx: any) => {
    const t = lists[target];
    if (!t) return false;
    const args = { session: ctx.session, context: ctx, listKey: target, operation: 'query' };
    if (!(await passes(t.access?.operation?.query ?? t.access?.operation, args))) return false;
    // Target users are exposed only as oneself; their personal fields are gated on their own.
    if (target === 'User') return true;
    const f = t.access?.filter?.query;
    if (typeof f !== 'function') return true;
    let result: unknown;
    try { result = await f(args); } catch { return false; }
    if (result === false) return false;
    // An owner-restricted target (my favourites, my orders) must not be filtered through by anyone else.
    return !(ctx.session?.itemId && JSON.stringify(result ?? {}).includes(String(ctx.session.itemId)));
  };

  // Keystone generates the back-reference (from_<List>_<field>) on the target list with the list-level default.
  // It reads through the SOURCE list, so it follows the same rule as a forward relation to that list.
  const backRef = (kind: 'filter' | 'order') => async (args: any) => {
    const m = /^from_([A-Za-z]+)_/.exec(String(args.fieldKey || ''));
    return m ? readableRelation(m[1], args.context) : true;
  };

  for (const [listKey, list] of Object.entries<any>(lists)) {
    list.isFilterable = backRef('filter');
    list.isOrderable = backRef('order');
    const fields = list.fields;
    if (!fields || typeof fields !== 'object') continue;
    for (const [fieldKey, factory] of Object.entries<any>(fields)) {
      if (typeof factory !== 'function') continue;
      fields[fieldKey] = (data: any) => {
        const config = factory(data);
        const prior = { filter: config.isFilterable, order: config.isOrderable };
        const guard = (kind: 'filter' | 'order') => async (args: any) => {
          if (NEVER.has(fieldKey)) return false;
          if (prior[kind] !== undefined && !(await passes(prior[kind], args))) return false;
          const read = config.access && typeof config.access === 'object' ? config.access.read : config.access;
          if (!(await passes(read, { ...args, operation: 'read' }))) return false;
          if (listKey === 'User' && USER_PERSONAL.has(fieldKey) && !(await permissions.canManageUsers(args))) return false;
          if (config.dbField?.kind === 'relation') return readableRelation(config.dbField.list, args.context);
          return true;
        };
        return { ...config, isFilterable: guard('filter'), isOrderable: guard('order') };
      };
    }
  }
  return lists;
}
