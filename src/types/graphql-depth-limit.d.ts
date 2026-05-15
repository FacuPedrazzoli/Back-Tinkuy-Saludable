declare module "graphql-depth-limit" {
  import { DocumentNode } from "graphql";

  interface DepthLimitOptions {
    ignoreIntrospection?: boolean;
    maxDepth?: number;
  }

  function depthLimit(
    document: DocumentNode,
    maxDepth: number,
    options?: DepthLimitOptions
  ): Error[] | undefined;

  export = depthLimit;
}
