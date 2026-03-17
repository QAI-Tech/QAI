"use client";

import type { ViewMode } from "../hooks/useViewMode";

interface TabSwitcherOverlayProps {
  isClient: boolean;
  activeTab: ViewMode;
  onTabChange: (tab: ViewMode) => void;
}

export default function TabSwitcherOverlay({
  isClient,
  activeTab,
  onTabChange,
}: TabSwitcherOverlayProps) {
  if (!isClient) return null;

  return (
    <div
      className="fixed top-0 left-0"
      style={{
        position: "fixed",
        top: "1rem",
        left: "1rem",
        zIndex: 10001,
      }}
    >
      <div
        className="backdrop-blur-sm rounded-lg"
        style={{
          backgroundColor: "rgba(255, 255, 255, 0.1)",
          border: "1px solid rgba(255, 255, 255, 0.2)",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: "0.25rem",
            padding: "0.25rem",
          }}
        >
          {/* Feature Viewer Tab */}
          <button
            onClick={() => onTabChange("feature")}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "0.375rem",
              fontSize: "0.875rem",
              fontWeight: "500",
              color: "white",
              cursor: "pointer",
              border: "none",
              backgroundColor:
                activeTab === "feature"
                  ? "rgba(255, 255, 255, 0.2)"
                  : "transparent",
              transition: "background-color 0.2s ease",
            }}
            onMouseEnter={(e) => {
              if (activeTab !== "feature") {
                e.currentTarget.style.backgroundColor =
                  "rgba(255, 255, 255, 0.1)";
              }
            }}
            onMouseLeave={(e) => {
              if (activeTab !== "feature") {
                e.currentTarget.style.backgroundColor = "transparent";
              }
            }}
          >
            Feature Viewer
          </button>

          {/* Flow Viewer Tab */}
          <button
            onClick={() => onTabChange("flow")}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "0.375rem",
              fontSize: "0.875rem",
              fontWeight: "500",
              color: "white",
              cursor: "pointer",
              border: "none",
              backgroundColor:
                activeTab === "flow"
                  ? "rgba(255, 255, 255, 0.2)"
                  : "transparent",
              transition: "background-color 0.2s ease",
            }}
            onMouseEnter={(e) => {
              if (activeTab !== "flow") {
                e.currentTarget.style.backgroundColor =
                  "rgba(255, 255, 255, 0.1)";
              }
            }}
            onMouseLeave={(e) => {
              if (activeTab !== "flow") {
                e.currentTarget.style.backgroundColor = "transparent";
              }
            }}
          >
            Flow Viewer
          </button>
        </div>
      </div>
    </div>
  );
}
