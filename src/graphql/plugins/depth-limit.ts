import type { ApolloServerPlugin } from "@apollo/server";
import type { DocumentNode } from "graphql";
import depthLimit from "graphql-depth-limit";

const MAX_DEPTH = 10;

export function depthLimitPlugin(): ApolloServerPlugin {
  return {
    async requestDidStart() {
      return {
        async didResolveOperation({ request, document }: { request: { operationName?: string }; document: DocumentNode }) {
          const query = request.operationName ?? "Anonymous Query";
          const errors = depthLimit(
            document,
            MAX_DEPTH,
            { ignoreIntrospection: false }
          );
          if (errors) {
            throw new Error(`Query "${query}" exceeds maximum depth of ${MAX_DEPTH}`);
          }
        },
      };
    },
  };
}
