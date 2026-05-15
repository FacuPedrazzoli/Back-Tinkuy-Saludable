import type { ApolloServerPlugin } from "@apollo/server";
import type { DocumentNode } from "graphql";

const COMPLEXITY_LIMIT = 1000;

interface ComplexityResult {
  complexity: number;
  depth: number;
}

function calculateComplexity(node: { kind?: string; selectionSet?: { selections: unknown[] } }, depth: number = 0): ComplexityResult {
  let complexity = 1;
  let maxChildDepth = depth;

  if (!node) return { complexity: 0, depth: 0 };

  if (node.kind === "Field") {
    complexity += depth * 2;
  }

  if (node.selectionSet?.selections) {
    for (const selection of node.selectionSet.selections) {
      const childResult = calculateComplexity(selection as typeof node, depth + 1);
      complexity += childResult.complexity;
      maxChildDepth = Math.max(maxChildDepth, childResult.depth);
    }
  }

  return { complexity, depth: maxChildDepth };
}

export function queryComplexityPlugin(): ApolloServerPlugin {
  return {
    async requestDidStart() {
      return {
        async didResolveOperation({ document }: { document: DocumentNode }) {
          let totalComplexity = 0;

          for (const definition of document.definitions) {
            if (definition.kind === "OperationDefinition") {
              if (definition.selectionSet) {
                for (const selection of definition.selectionSet.selections) {
                  const result = calculateComplexity(selection as { kind?: string; selectionSet?: { selections: unknown[] } }, 1);
                  totalComplexity += result.complexity;
                }
              }
            }
          }

          if (totalComplexity > COMPLEXITY_LIMIT) {
            throw new Error(
              `Query complexity ${totalComplexity} exceeds maximum limit of ${COMPLEXITY_LIMIT}`
            );
          }
        },
      };
    },
  };
}
