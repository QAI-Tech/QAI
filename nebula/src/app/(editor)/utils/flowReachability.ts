// @ts-nocheck
import { Flow } from "@/app/(editor)/components/FlowManager";

/**
 * Determines if a flow can reach an entry point through a chain of other flows.
 *
 * @param targetFlow - The flow to check for reachability
 * @param allFlows - All available flows in the system
 * @param entryPointNodeIds - Array of node IDs that are considered entry points
 * @returns Object with reachability status and the chain of flows if reachable
 */
export function isFlowReachableFromEntryPoint(
  targetFlow: Flow,
  allFlows: Flow[],
  entryPointNodeIds: string[],
): { isReachable: boolean; flowChain: Flow[] } {
  // Handle empty flow
  if (!targetFlow.pathNodeIds || targetFlow.pathNodeIds.length === 0) {
    return { isReachable: false, flowChain: [] };
  }

  // Get the start node of the target flow (first node in path)
  const startNodeId = targetFlow.pathNodeIds[0];

  // Check if this flow already starts at an entry point
  if (entryPointNodeIds.includes(startNodeId)) {
    return { isReachable: true, flowChain: [targetFlow] };
  }

  // Use a set to track visited flows to prevent infinite loops
  const visitedFlowIds = new Set<string>();

  /**
   * Recursive helper function to check reachability and build chain
   */
  function checkReachability(
    flowToCheck: Flow,
    currentChain: Flow[] = [],
  ): Flow[] | null {
    // Prevent infinite loops
    if (visitedFlowIds.has(flowToCheck.id)) {
      return null;
    }

    visitedFlowIds.add(flowToCheck.id);

    // Handle empty flow
    if (!flowToCheck.pathNodeIds || flowToCheck.pathNodeIds.length === 0) {
      return null;
    }

    const flowStartNodeId = flowToCheck.pathNodeIds[0];

    // Base case: if this flow starts at an entry point, we found a path
    if (entryPointNodeIds.includes(flowStartNodeId)) {
      return [flowToCheck, ...currentChain];
    }

    // Find all flows whose end node matches this flow's start node
    const connectingFlows = allFlows.filter((flow) => {
      // Skip the current flow and already visited flows
      if (flow.id === flowToCheck.id || visitedFlowIds.has(flow.id)) {
        return false;
      }

      // Check if this flow's end node matches our start node
      if (!flow.pathNodeIds || flow.pathNodeIds.length === 0) {
        return false;
      }

      const flowEndNodeId = flow.pathNodeIds[flow.pathNodeIds.length - 1];
      return flowEndNodeId === flowStartNodeId;
    });

    // Recursively check each connecting flow
    for (const connectingFlow of connectingFlows) {
      const result = checkReachability(connectingFlow, [
        flowToCheck,
        ...currentChain,
      ]);
      if (result) {
        return result;
      }
    }

    return null;
  }

  const flowChain = checkReachability(targetFlow);
  return {
    isReachable: flowChain !== null,
    flowChain: flowChain || [],
  };
}

/**
 * Finds all possible flow chains from all entry points to a target flow.
 *
 * @param targetFlow - The flow to find chains for
 * @param allFlows - All available flows in the system
 * @param entryPointNodeIds - Array of node IDs that are considered entry points
 * @returns Object with reachability status and all possible flow chains
 */
export function getAllFlowChainsFromEntryPoints(
  targetFlow: Flow,
  allFlows: Flow[],
  entryPointNodeIds: string[],
  maxChainLength?: number,
  maxResults?: number,
): { isReachable: boolean; flowChains: Flow[][] } {
  // Handle empty flow
  if (!targetFlow.pathNodeIds || targetFlow.pathNodeIds.length === 0) {
    return { isReachable: false, flowChains: [] };
  }

  const startNodeId = targetFlow.pathNodeIds[0];
  const allChains: Flow[][] = [];

  // Check if this flow already starts at an entry point
  if (entryPointNodeIds.includes(startNodeId)) {
    allChains.push([targetFlow]);
  }

  /**
   * Recursive helper function to find all possible chains
   */
  function findAllChains(
    flowToCheck: Flow,
    currentChain: Flow[] = [],
    visitedFlowIds: Set<string> = new Set(),
  ): Flow[][] {
    // Prevent infinite loops
    if (visitedFlowIds.has(flowToCheck.id)) {
      return [];
    }

    // Check max results limit
    if (maxResults && allChains.length >= maxResults) {
      return [];
    }

    // Check max chain length limit
    if (maxChainLength && currentChain.length >= maxChainLength) {
      return [];
    }

    // Handle empty flow
    if (!flowToCheck.pathNodeIds || flowToCheck.pathNodeIds.length === 0) {
      return [];
    }

    const flowStartNodeId = flowToCheck.pathNodeIds[0];
    const newVisited = new Set(visitedFlowIds);
    newVisited.add(flowToCheck.id);

    // Base case: if this flow starts at an entry point, we found a complete chain
    if (entryPointNodeIds.includes(flowStartNodeId)) {
      const newChain = [flowToCheck, ...currentChain];

      // Check if this chain exceeds max length (including the current flow)
      if (maxChainLength && newChain.length > maxChainLength) {
        return [];
      }

      return [newChain];
    }

    // Find all flows whose end node matches this flow's start node
    const connectingFlows = allFlows.filter((flow) => {
      // Skip the current flow and already visited flows
      if (flow.id === flowToCheck.id || visitedFlowIds.has(flow.id)) {
        return false;
      }

      // Check if this flow's end node matches our start node
      if (!flow.pathNodeIds || flow.pathNodeIds.length === 0) {
        return false;
      }

      const flowEndNodeId = flow.pathNodeIds[flow.pathNodeIds.length - 1];
      return flowEndNodeId === flowStartNodeId;
    });

    // Recursively find all chains through each connecting flow
    const allFoundChains: Flow[][] = [];
    for (const connectingFlow of connectingFlows) {
      // Early termination if we've hit max results
      if (maxResults && allChains.length >= maxResults) {
        break;
      }

      const chains = findAllChains(
        connectingFlow,
        [flowToCheck, ...currentChain],
        newVisited,
      );
      allFoundChains.push(...chains);

      // Add found chains to global collection for limit checking
      allChains.push(...chains);

      // Early termination if we've hit max results
      if (maxResults && allChains.length >= maxResults) {
        break;
      }
    }

    return allFoundChains;
  }

  // Only search for additional chains if we don't start at an entry point
  if (!entryPointNodeIds.includes(startNodeId)) {
    const foundChains = findAllChains(targetFlow);
    // Remove duplicates that might have been added during the recursive process
    const uniqueChains = foundChains.filter(
      (chain, index) =>
        foundChains.findIndex(
          (c) =>
            c.length === chain.length &&
            c.every((flow, i) => flow.id === chain[i].id),
        ) === index,
    );
    allChains.push(...uniqueChains);
  }

  // Apply max results limit to final result
  const finalChains = maxResults ? allChains.slice(0, maxResults) : allChains;

  return {
    isReachable: finalChains.length > 0,
    flowChains: finalChains,
  };
}
