import { GraphQLError } from 'graphql';

/**
 * A business-rule message written for the customer or operator. Production
 * GraphQL masking hides plain Errors as "Unexpected error"; a GraphQLError with
 * a code passes through, so only use this for text that is safe to show.
 * `public: true` tells the dashboard this text was written for the person on
 * screen (GraphQL's own BAD_USER_INPUT errors echo request values and stay hidden).
 */
export function publicError(message: string, code = 'BAD_USER_INPUT') {
  return new GraphQLError(message, { extensions: { code, public: true } });
}
