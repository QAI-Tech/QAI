import { useState, useEffect } from "react";

interface ExtensionCheckResult {
  isInstalled: boolean;
  isChecking: boolean;
}

export function useExtensionCheck(): ExtensionCheckResult {
  const [isInstalled, setIsInstalled] = useState<boolean>(false);
  const [isChecking, setIsChecking] = useState<boolean>(true);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    let intervalId: NodeJS.Timeout | null = null;
    let isActive = true;

    const handleResponse = (event: MessageEvent) => {
      if (event.source !== window || !isActive) return;
      const data = event.data;

      if (
        data?.type === "QAI_WEB_RECORDER_COMMAND_RESPONSE" &&
        data?.command === "GET_STATE"
      ) {
        clearTimeout(timeoutId);
        setIsInstalled(true);
        setIsChecking(false);
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
        window.removeEventListener("message", handleResponse);
      }
    };

    const checkExtension = () => {
      if (!isActive) return;

      setIsChecking(true);

      window.addEventListener("message", handleResponse);

      window.postMessage(
        {
          type: "QAI_WEB_RECORDER_COMMAND",
          command: "GET_STATE",
        },
        window.location.origin,
      );

      timeoutId = setTimeout(() => {
        if (isActive) {
          setIsInstalled(false);
          setIsChecking(false);
        }
        window.removeEventListener("message", handleResponse);
      }, 500);
    };

    checkExtension();

    intervalId = setInterval(checkExtension, 30000);

    return () => {
      isActive = false;
      clearTimeout(timeoutId);
      if (intervalId) {
        clearInterval(intervalId);
      }
      window.removeEventListener("message", handleResponse);
    };
  }, []);

  return { isInstalled, isChecking };
}
