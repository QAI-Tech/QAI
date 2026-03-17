// @ts-nocheck
import { useState, useEffect, useRef } from "react";
import { Flow } from "@/app/(editor)/components/FlowManager";
import {
  computeFlowChainsAsync,
  FlowChainResult,
} from "@/app/(editor)/utils/asyncFlowReachability";

interface UseAsyncFlowChainsResult {
  flowChainResults: Map<string, FlowChainResult>;
  isLoading: boolean;
  isComplete: boolean;
  getFlowChainResult: (flowId: string) => FlowChainResult | null;
}

export function useAsyncFlowChains(
  flows: Flow[],
  entryPointIds: string[],
): UseAsyncFlowChainsResult {
  const [flowChainResults, setFlowChainResults] = useState<
    Map<string, FlowChainResult>
  >(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  const currentComputationRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Cancel any ongoing computation
    if (currentComputationRef.current) {
      currentComputationRef.current.abort();
    }

    // If no flows, clear results
    if (flows.length === 0) {
      setFlowChainResults(new Map());
      setIsLoading(false);
      setIsComplete(true);
      return;
    }

    // Start async computation
    setIsLoading(true);
    setIsComplete(false);

    const abortController = new AbortController();
    currentComputationRef.current = abortController;

    computeFlowChainsAsync(flows, entryPointIds)
      .then((result) => {
        // Check if computation was aborted
        if (abortController.signal.aborted) {
          return;
        }

        setFlowChainResults(result.results);
        setIsComplete(result.isComplete);
        setIsLoading(false);
      })
      .catch((error) => {
        if (!abortController.signal.aborted) {
          console.error("Error computing flow chains:", error);
          setIsLoading(false);
          setIsComplete(true);
        }
      });

    return () => {
      abortController.abort();
    };
  }, [JSON.stringify(flows), JSON.stringify(entryPointIds)]);

  const getFlowChainResult = (flowId: string): FlowChainResult | null => {
    return flowChainResults.get(flowId) || null;
  };

  return {
    flowChainResults,
    isLoading,
    isComplete,
    getFlowChainResult,
  };
}
