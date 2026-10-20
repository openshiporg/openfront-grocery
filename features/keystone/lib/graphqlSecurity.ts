import { GraphQLError, Kind, parse, type ASTNode, type DocumentNode, type FragmentDefinitionNode, type SelectionSetNode, type ValidationContext, type ValidationRule } from 'graphql';
import { normalizeClientIp } from './clientIp';

export const MAX_GRAPHQL_QUERY_LENGTH = 100_000;
export const MAX_GRAPHQL_DEPTH = 12;

function fragmentMap(document: DocumentNode) {
  return new Map(document.definitions.filter((definition): definition is FragmentDefinitionNode => definition.kind === Kind.FRAGMENT_DEFINITION).map((fragment) => [fragment.name.value, fragment]));
}

const MAX_DEPTH_VALIDATION_WORK = 20_000;

class DepthBudgetExceeded extends Error {}

/**
 * Depth of a selection set counted in fields (fragment spreads and inline
 * fragments add no level). Each named fragment's depth is computed once and
 * memoized, cycles are cut (graphql's NoFragmentCycles rejects them), total
 * work is budgeted, and traversal stops as soon as the limit is exceeded — so a
 * small document of fragments that spread each other repeatedly costs linear
 * work instead of exponential expansion.
 */
function selectionDepth(selectionSet: SelectionSetNode | undefined, fragments: Map<string, FragmentDefinitionNode>, memo: Map<string, number>, visiting: Set<string>, work: { count: number }): number {
  if (!selectionSet) return 0;
  let maximum = 0;
  for (const selection of selectionSet.selections) {
    if (++work.count > MAX_DEPTH_VALIDATION_WORK) throw new DepthBudgetExceeded();
    let depth = 0;
    if (selection.kind === Kind.FIELD) depth = 1 + selectionDepth(selection.selectionSet, fragments, memo, visiting, work);
    else if (selection.kind === Kind.INLINE_FRAGMENT) depth = selectionDepth(selection.selectionSet, fragments, memo, visiting, work);
    else {
      const name = selection.name.value;
      if (memo.has(name)) depth = memo.get(name) ?? 0;
      else if (!visiting.has(name)) {
        visiting.add(name);
        depth = selectionDepth(fragments.get(name)?.selectionSet, fragments, memo, visiting, work);
        visiting.delete(name);
        memo.set(name, depth);
      }
    }
    if (depth > maximum) maximum = depth;
    if (maximum > MAX_GRAPHQL_DEPTH) return maximum;
  }
  return maximum;
}

export const boundedGraphqlDepthRule: ValidationRule = (context: ValidationContext) => ({
  Document(node) {
    const fragments = fragmentMap(node);
    const memo = new Map<string, number>();
    const work = { count: 0 };
    for (const definition of node.definitions) {
      if (definition.kind !== Kind.OPERATION_DEFINITION) continue;
      try {
        if (selectionDepth(definition.selectionSet, fragments, memo, new Set(), work) > MAX_GRAPHQL_DEPTH) {
          context.reportError(new GraphQLError(`GraphQL query depth exceeds ${MAX_GRAPHQL_DEPTH}`, { nodes: definition as ASTNode }));
        }
      } catch (error) {
        if (!(error instanceof DepthBudgetExceeded)) throw error;
        context.reportError(new GraphQLError('GraphQL query is too complex', { nodes: definition as ASTNode }));
        return;
      }
    }
  },
});

export const rejectIntrospectionInProduction: ValidationRule = (context: ValidationContext) => ({
  Field(node) {
    if (process.env.NODE_ENV === 'production' && (node.name.value === '__schema' || node.name.value === '__type')) {
      context.reportError(new GraphQLError('GraphQL introspection is disabled in production', { nodes: node }));
    }
  },
});

function documentFor(query?: string | null) {
  try { return parse(query || ''); } catch { return null; }
}

function operationDefinitions(query?: string | null) {
  return documentFor(query)?.definitions.filter((definition) => definition.kind === Kind.OPERATION_DEFINITION) || [];
}

export function isGraphqlMutation(query?: string | null) {
  return operationDefinitions(query).some((definition) => definition.operation === 'mutation' || definition.operation === 'subscription');
}

export function isDangerousAuthOperation(query?: string | null) {
  const document = documentFor(query);
  if (!document) return false;
  const fragments = fragmentMap(document);
  const names = new Set([
    'authenticateUserWithPassword',
    'createInitialUser',
    'sendUserPasswordResetLink',
    'redeemUserPasswordResetToken',
  ]);
  const visit = (selectionSet: SelectionSetNode | undefined, seen: Set<string>): boolean => selectionSet?.selections.some((selection) => {
    if (selection.kind === Kind.FIELD && names.has(selection.name.value)) return true;
    if (selection.kind === Kind.INLINE_FRAGMENT) return visit(selection.selectionSet, seen);
    if (selection.kind === Kind.FRAGMENT_SPREAD && !seen.has(selection.name.value)) return visit(fragments.get(selection.name.value)?.selectionSet, new Set(seen).add(selection.name.value));
    return false;
  }) || false;
  return operationDefinitions(query).some((definition) => visit(definition.selectionSet, new Set()));
}

export function requestIp(headers?: Headers, remoteAddress?: string | null) {
  if (process.env.TRUSTED_PROXY === 'true') {
    // Railway's HTTP edge overwrites X-Real-IP. Missing or malformed metadata
    // stays in one conservative fallback bucket; XFF and custom identity
    // headers are never accepted as client identity.
    return normalizeClientIp(headers?.get('x-real-ip')) || 'unverified-proxy';
  }
  return normalizeClientIp(remoteAddress) || 'local';
}