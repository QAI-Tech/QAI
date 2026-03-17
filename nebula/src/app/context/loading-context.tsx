"use client";

import React, { createContext, useState, useContext, ReactNode } from "react";

type LoadingContextType = {
  isAppLoading: boolean;
  setAppLoading: (loading: boolean) => void;
};

const LoadingContext = createContext<LoadingContextType | undefined>(undefined);

export const LoadingProvider = ({ children }: { children: ReactNode }) => {
  const [isAppLoading, setIsAppLoading] = useState(true);

  const setAppLoading = (loading: boolean) => setIsAppLoading(loading);

  return (
    <LoadingContext.Provider
      value={{
        isAppLoading,
        setAppLoading,
      }}
    >
      {children}
    </LoadingContext.Provider>
  );
};

export const useLoading = () => {
  const context = useContext(LoadingContext);
  if (context === undefined) {
    throw new Error("useLoading must be used within a LoadingProvider");
  }
  return context;
};
