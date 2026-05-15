import { ApolloServerPlugin } from "@apollo/server";
import depthLimit from "graphql-depth-limit";

const MAX_DEPTH = 10;

export const depthLimitPlugin: ApolloServerPlugin = {
  async requestDidStart() {
    return {
      async didResolveOperation({ request, document }) {
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
