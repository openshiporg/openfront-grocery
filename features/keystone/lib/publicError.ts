import { GraphQLError } from 'graphql';

/**
 * A business-rule message written for the customer or operator. Production
 * GraphQL masking hides plain Errors as "Unexpected error"; a GraphQLError with
 * a code passes through, so only use this for text that is safe to show.
 */
export function publicError(message: string, code = 'BAD_USER_INPUT') {
  return new GraphQLError(message, { extensions: { code } });
}
