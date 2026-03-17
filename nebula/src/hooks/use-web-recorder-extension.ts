"use client";

import { useState, useEffect } from "react";

export interface WebRecorderState {
  isInstalled: boolean;
  isCapturing: boolean;
  actionCount: number;
  isAuthenticated: boolean;
}

export function useWebRecorderExtension() {
  const [state, setState] = useState<WebRecorderState>({
    isInstalled: false,
    isCapturing: false,
    actionCount: 0,
    isAuthenticated: false,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const checkExtensionState = () => {
      window.postMessage(
        { type: "QAI_WEB_RECORDER_COMMAND", command: "GET_STATE" },
        window.location.origin,
      );
    };

    const messageHandler = (event: MessageEvent) => {
      if (event.source !== window) return;
      const data = event.data;
      if (!data || typeof data !== "object") return;

      if (data.type === "QAI_WEB_RECORDER_COMMAND_RESPONSE") {
        if (data.command === "GET_STATE" && data.success) {
          const extensionState = data.state;
          setState({
            isInstalled: true,
            isCapturing: extensionState?.isCapturing || false,
            actionCount: extensionState?.actions?.length || 0,
            isAuthenticated: extensionState?.authenticated || false,
          });
        }
      }

      if (data.type === "QAI_CAPTURER_STATE") {
        setState((prev) => ({
          ...prev,
          isInstalled: true,
          isCapturing: data.isCapturing,
          actionCount:
            data.actionCount ?? (data.isCapturing ? prev.actionCount : 0),
        }));
      }

      if (data.type === "QAI_RECORDER_ACTION") {
        setState((prev) => ({
          ...prev,
          isInstalled: true,
          actionCount: prev.isCapturing ? prev.actionCount + 1 : 0,
        }));
      }
    };

    window.addEventListener("message", messageHandler);

    checkExtensionState();

    const pollInterval = setInterval(checkExtensionState, 5000);

    return () => {
      window.removeEventListener("message", messageHandler);
      clearInterval(pollInterval);
    };
  }, []);

  return state;
}
