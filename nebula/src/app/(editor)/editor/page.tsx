// @ts-nocheck
"use client";

import React, { useEffect, useState } from "react";
import Navigation from "@/components/navigation";
import GraphEditor from "../components/GraphEditor";
import "../index.css";
import { useProductSwitcher } from "@/providers/product-provider";

export default function Editor() {
  const { productSwitcher } = useProductSwitcher();

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = ""; // Triggers the browser's built-in confirmation
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen">
      <header className="h-14 shrink-0 border-b">
        <Navigation showBackToQAIButton={true} />
      </header>
      <main className="flex-1 min-h-0 overflow-auto flex flex-col">
        <GraphEditor />
      </main>
    </div>
  );
}
