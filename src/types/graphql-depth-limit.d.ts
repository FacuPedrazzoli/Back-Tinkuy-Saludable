declare module "graphql-depth-limit" {
  import { ValidationContext, ASTVisitor } from "graphql";

  interface DepthLimitOptions {
    ignoreIntrospection?: boolean;
  }

  type DepthCallback = (depths: Record<string, number>) => void;

  function depthLimit(
    maxDepth: number,
    options?: DepthLimitOptions,
    callback?: DepthCallback
  ): (context: ValidationContext) => ASTVisitor;

  export = depthLimit;
}
