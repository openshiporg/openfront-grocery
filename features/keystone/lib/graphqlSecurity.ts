import { GraphQLError, Kind, parse, type ASTNode, type DocumentNode, type FragmentDefinitionNode, type SelectionSetNode, type ValidationContext, type ValidationRule } from 'graphql';
import { verifyProxyIdentity } from './proxyIdentity';

export const MAX_GRAPHQL_QUERY_LENGTH = 100_000;
export const MAX_GRAPHQL_DEPTH = 12;

function fragmentMap(document: DocumentNode) {
  return new Map(document.definitions.filter((definition): definition is FragmentDefinitionNode => definition.kind === Kind.FRAGMENT_DEFINITION).map((fragment) => [fragment.name.value, fragment]));
}

function depthOfSelectionSet(selectionSet: SelectionSetNode | undefined, fragments: Map<string, FragmentDefinitionNode>, depth: number, seen: Set<string>, report: (node: ASTNode) => void): number {
  if (!selectionSet) return depth;
  let maximum = depth;
  for (const selection of selectionSet.selections) {
    if (selection.kind === Kind.FRAGMENT_SPREAD) {
      if (seen.has(selection.name.value)) continue;
      const nextSeen = new Set(seen).add(selection.name.value);
      maximum = Math.max(maximum, depthOfSelectionSet(fragments.get(selection.name.value)?.selectionSet, fragments, depth + 1, nextSeen, report));
      continue;
    }
    if (selection.kind === Kind.INLINE_FRAGMENT) {
      maximum = Math.max(maximum, depthOfSelectionSet(selection.selectionSet, fragments, depth + 1, seen, report));
      continue;
    }
    const nextDepth = depth + 1;
    if (nextDepth > MAX_GRAPHQL_DEPTH) report(selection);
    maximum = Math.max(maximum, depthOfSelectionSet(selection.selectionSet, fragments, nextDepth, seen, report));
  }
  return maximum;
}

export const boundedGraphqlDepthRule: ValidationRule = (context: ValidationContext) => ({
  Document(node) {
    const fragments = fragmentMap(node);
    for (const definition of node.definitions) {
      if (definition.kind === Kind.OPERATION_DEFINITION) {
        depthOfSelectionSet(definition.selectionSet, fragments, 0, new Set(), (selection) => context.reportError(new GraphQLError(`GraphQL query depth exceeds ${MAX_GRAPHQL_DEPTH}`, { nodes: selection as ASTNode })));
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

export function requestIp(headers?: Headers) {
  if (process.env.TRUSTED_PROXY !== 'true') return 'untrusted-proxy';
  const identity = headers?.get('x-grocery-proxy-identity')?.trim() || '';
  const secret = process.env.TRUSTED_PROXY_IDENTITY_SECRET?.trim() || '';
  return verifyProxyIdentity(identity, secret)?.ip || 'unverified-proxy';
}