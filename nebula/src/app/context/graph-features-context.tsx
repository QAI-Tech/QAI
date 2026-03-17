"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";
import { Feature } from "@/app/(editor)/components/FlowManager";

interface GraphFeaturesContextType {
  features: Feature[];
  setFeatures: (features: Feature[]) => void;
}

const GraphFeaturesContext = createContext<
  GraphFeaturesContextType | undefined
>(undefined);

export const GraphFeaturesProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [features, setFeatures] = useState<Feature[]>([]);

  return (
    <GraphFeaturesContext.Provider value={{ features, setFeatures }}>
      {children}
    </GraphFeaturesContext.Provider>
  );
};

export const useGraphFeatures = () => {
  const context = useContext(GraphFeaturesContext);
  if (!context) {
    return { features: [], setFeatures: () => {} };
  }
  return context;
};
