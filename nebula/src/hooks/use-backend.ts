import { TestSchema } from "@/lib/types";
import { useState } from "react";

// Custom hook for handling the LLM request
export const useBackend = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{ message: TestSchema } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generateInstructions = async (formData: FormData) => {
    setLoading(true);
    setError(null);
    setData(null);
    // Debugging
    console.log("Use backend hook formData", formData);
    try {
      const response = await fetch("/api/generate-instructions", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to fetch testing instructions");
      }

      const result = await response.json();
      setData(result);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return { generateInstructions, loading, data, error };
};
