"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";
import { Flow } from "@/app/(editor)/components/FlowManager";
import type { VideoFlowQueueItem } from "@/app/store/videoFlowQueueSlice";

interface GraphFlowsContextType {
  flows: Flow[];
  setFlows: (flows: Flow[]) => void;
  nodesCount: number;
  setNodesCount: (count: number) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  videoQueueItems: VideoFlowQueueItem[];
  setVideoQueueItems: (items: VideoFlowQueueItem[]) => void;
}

const GraphFlowsContext = createContext<GraphFlowsContextType | undefined>(
  undefined,
);

export const GraphFlowsProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [nodesCount, setNodesCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [videoQueueItems, setVideoQueueItems] = useState<VideoFlowQueueItem[]>(
    [],
  );

  return (
    <GraphFlowsContext.Provider
      value={{
        flows,
        setFlows,
        nodesCount,
        setNodesCount,
        isLoading,
        setIsLoading,
        videoQueueItems,
        setVideoQueueItems,
      }}
    >
      {children}
    </GraphFlowsContext.Provider>
  );
};

export const useGraphFlows = () => {
  const context = useContext(GraphFlowsContext);
  if (!context) {
    return {
      flows: [],
      setFlows: () => {},
      nodesCount: 0,
      setNodesCount: () => {},
      isLoading: true,
      setIsLoading: () => {},
      videoQueueItems: [],
      setVideoQueueItems: () => {},
    };
  }
  return context;
};
