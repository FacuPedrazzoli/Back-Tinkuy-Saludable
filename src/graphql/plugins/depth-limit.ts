import type { ApolloServerPlugin } from "@apollo/server";
import type { DocumentNode, GraphQLSchema } from "graphql";
import { validate } from "graphql";
import depthLimit from "graphql-depth-limit";

const MAX_DEPTH = 10;

export function depthLimitPlugin(): ApolloServerPlugin {
  return {
    async requestDidStart() {
      return {
        async didResolveOperation({
          request,
          document,
          schema,
        }: {
          request: { operationName?: string };
          document: DocumentNode;
          schema: GraphQLSchema;
        }) {
          const query = request.operationName ?? "Anonymous Query";
          const errors = validate(schema, document, [
            depthLimit(MAX_DEPTH, { ignoreIntrospection: false }),
          ]);
          if (errors.length > 0) {
            throw new Error(`Query "${query}" exceeds maximum depth of ${MAX_DEPTH}`);
          }
        },
      };
    },
  };
}
