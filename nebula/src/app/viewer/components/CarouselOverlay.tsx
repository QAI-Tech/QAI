"use client";

interface CarouselOverlayProps {
  isClient: boolean;
  currentNodeIndex: number;
  totalNodes: number;
  currentDescription: string;
  outgoingEdgeDescription: string;
  onPrevious: () => void;
  onNext: () => void;
  overlayOpacity?: number;
}

export default function CarouselOverlay({
  isClient,
  currentNodeIndex,
  totalNodes,
  currentDescription,
  outgoingEdgeDescription,
  onPrevious,
  onNext,
  overlayOpacity = 1,
}: CarouselOverlayProps) {
  if (!isClient) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 w-full"
      style={{
        position: "fixed",
        bottom: "1rem",
        left: "1rem",
        right: "1rem",
        zIndex: 9999,
        opacity: overlayOpacity,
      }}
    >
      <div
        className="backdrop-blur-sm rounded-lg"
        style={{
          backgroundColor: "rgba(255, 255, 255, 0.1)",
          border: "1px solid rgba(255, 255, 255, 0.2)",
          padding: "1.5rem",
        }}
      >
        <div
          style={{
            display: "flex",
            width: "100%",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          {/* Left: Previous */}
          <div
            style={{
              flex: "1",
              textAlign: "center",
              cursor: currentNodeIndex <= 0 ? "not-allowed" : "pointer",
              opacity: currentNodeIndex <= 0 ? 0 : 1,
              color: "white",
              fontSize: "0.875rem",
              fontWeight: "500",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "opacity 0.2s ease",
            }}
            onClick={currentNodeIndex <= 0 ? undefined : onPrevious}
          >
            Previous
            <br />←
          </div>

          {/* Center: Current Node Info */}
          <div
            style={{
              flex: "1",
              textAlign: "center",
              padding: "0 2rem",
              color: "white",
              fontSize: "0.875rem",
              fontWeight: "500",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div>
              {currentDescription}
              <br />
              <br />
              {currentNodeIndex + 1} of {totalNodes}
            </div>
          </div>

          {/* Right: Next/Edge Description */}
          <div
            style={{
              flex: "1",
              textAlign: "center",
              cursor:
                currentNodeIndex >= totalNodes - 1 ? "not-allowed" : "pointer",
              opacity: currentNodeIndex >= totalNodes - 1 ? 0 : 1,
              color: "white",
              fontSize: "0.875rem",
              fontWeight: "500",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "opacity 0.2s ease",
            }}
            onClick={currentNodeIndex >= totalNodes - 1 ? undefined : onNext}
          >
            {outgoingEdgeDescription}
            <br />
            Next →
          </div>
        </div>
      </div>
    </div>
  );
}
