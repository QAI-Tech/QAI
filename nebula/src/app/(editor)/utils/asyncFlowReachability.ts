// @ts-nocheck
import { Flow } from "@/app/(editor)/components/FlowManager";
import { getAllFlowChainsFromEntryPoints } from "./flowReachability";

export interface FlowChainResult {
  flowId: string;
  isReachable: boolean;
  flowChains: Flow[][];
  isLimited?: boolean; // Indicates if results were limited by maxChainLength or maxResults
}

export interface AsyncFlowChainResults {
  results: Map<string, FlowChainResult>;
  isComplete: boolean;
}

/**
 * Computes flow chains asynchronously using a two-phase approach:
 * Phase 1: Quick check for any reachability (no limits)
 * Phase 2: If reachable, recompute with limits (maxChainLength: 5, maxResults: 5)
 */
export function computeFlowChainsAsync(
  flows: Flow[],
  entryPointIds: string[],
): Promise<AsyncFlowChainResults> {
  return new Promise((resolve) => {
    const results = new Map<string, FlowChainResult>();
    let processedCount = 0;
    const totalFlows = flows.length;

    // If no flows, return immediately
    if (totalFlows === 0) {
      resolve({ results, isComplete: true });
      return;
    }

    function processNextBatch() {
      const startTime = performance.now();
      const batchSize = Math.min(5, totalFlows - processedCount); // Process up to 5 flows per batch

      for (let i = 0; i < batchSize && processedCount < totalFlows; i++) {
        const flow = flows[processedCount];
        // Phase 1: Quick check for any reachability (no limits)
        const quickCheck = getAllFlowChainsFromEntryPoints(
          flow,
          flows,
          entryPointIds,
        );

        let finalResult: FlowChainResult;

        if (quickCheck.isReachable) {
          // Phase 2: Recompute with limits if reachable
          const limitedResult = getAllFlowChainsFromEntryPoints(
            flow,
            flows,
            entryPointIds,
            5,
            5,
          );
          finalResult = {
            flowId: flow.id,
            isReachable: true,
            flowChains: limitedResult.flowChains,
            isLimited:
              limitedResult.flowChains.length < quickCheck.flowChains.length ||
              limitedResult.flowChains.some((chain) => chain.length >= 5),
          };
        } else {
          // Not reachable, use quick check result
          finalResult = {
            flowId: flow.id,
            isReachable: false,
            flowChains: [],
            isLimited: false,
          };
        }

        results.set(flow.id, finalResult);

        processedCount++;

        // Break if we've been processing for too long (avoid blocking)
        if (performance.now() - startTime > 16) {
          // ~1 frame at 60fps
          break;
        }
      }

      if (processedCount >= totalFlows) {
        resolve({ results, isComplete: true });
      } else {
        // Use requestIdleCallback if available, otherwise setTimeout
        if (typeof requestIdleCallback !== "undefined") {
          requestIdleCallback(processNextBatch, { timeout: 100 });
        } else {
          setTimeout(processNextBatch, 0);
        }
      }
    }

    processNextBatch();
  });
}

/**
 * Creates a hash of flow dependencies for caching
 */
export function createFlowDependencyHash(
  flows: Flow[],
  entryPointIds: string[],
): string {
  const flowData = flows
    .map((flow) => ({
      id: flow.id,
      path: flow.pathNodeIds.join(","),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const entryData = [...entryPointIds].sort().join(",");

  return JSON.stringify({ flows: flowData, entryPoints: entryData });
}
