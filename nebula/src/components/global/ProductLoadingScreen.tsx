import React from "react";

type ProductLoadingScreenProps = {
  message?: string;
  fullScreen?: boolean;
};

const ProductLoadingScreen: React.FC<ProductLoadingScreenProps> = ({
  message = "Please wait while we prepare your dashboard",
  fullScreen = true,
}) => {
  const containerClasses = fullScreen
    ? "h-screen w-screen flex items-center justify-center overflow-hidden relative bg-white"
    : "h-full w-full flex items-center justify-center overflow-hidden relative bg-transparent";

  return (
    <div className={containerClasses}>
      <div className="absolute z-10 flex flex-col items-center">
        {/* Animated hexagon icon */}
        <div className="hexagon-container mb-8">
          <svg
            className="hexagon-icon"
            viewBox="0 0 24 24"
            width="80"
            height="80"
          >
            {/* Path for the hexagon outline */}
            <path
              className="hexagon-path"
              d="M12,2 L20,7 L20,17 L12,22 L4,17 L4,7 L12,2 Z"
              fill="transparent"
              stroke="#8a2be2"
              strokeWidth="1.5"
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray="100"
              strokeDashoffset="100"
            />

            {/* Lines that converge to center */}
            <path
              className="converge-line"
              d="M12 2 L12 12"
              stroke="#8a2be2"
              strokeWidth="0.5"
              strokeDasharray="12"
              strokeDashoffset="12"
            />
            <path
              className="converge-line"
              d="M12 22 L12 12"
              stroke="#8a2be2"
              strokeWidth="0.5"
              strokeDasharray="12"
              strokeDashoffset="12"
            />
            <path
              className="converge-line"
              d="M4 7 L12 12"
              stroke="#8a2be2"
              strokeWidth="0.5"
              strokeDasharray="12"
              strokeDashoffset="12"
            />
            <path
              className="converge-line"
              d="M20 7 L12 12"
              stroke="#8a2be2"
              strokeWidth="0.5"
              strokeDasharray="12"
              strokeDashoffset="12"
            />
            <path
              className="converge-line"
              d="M4 17 L12 12"
              stroke="#8a2be2"
              strokeWidth="0.5"
              strokeDasharray="12"
              strokeDashoffset="12"
            />
            <path
              className="converge-line"
              d="M20 17 L12 12"
              stroke="#8a2be2"
              strokeWidth="0.5"
              strokeDasharray="12"
              strokeDashoffset="12"
            />
          </svg>
        </div>

        {/* Text content */}
        <div className="text-center relative">
          <div className="flex items-center justify-center mb-6">
            <div className="text-base text-gray-600 mb-1">{message}</div>
          </div>
        </div>
      </div>

      {/* CSS for animations */}
      <style jsx>{`
        /* Container animation */
        .hexagon-container {
          position: relative;
          width: 80px;
          height: 80px;
          animation: float 4s ease-in-out infinite;
          animation-delay: 1.5s;
        }

        @keyframes float {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-10px);
          }
        }

        /* Hexagon drawing animation */
        .hexagon-path {
          animation: drawHexagon 1.5s ease-out forwards;
        }

        @keyframes drawHexagon {
          to {
            stroke-dashoffset: 0;
          }
        }

        /* Lines converging animation */
        .converge-line {
          opacity: 0;
          animation:
            drawLine 0.8s ease-in forwards,
            pulseLine 3s linear infinite;
        }

        .converge-line:nth-child(2) {
          animation-delay: 0.8s, 1.8s;
        }
        .converge-line:nth-child(3) {
          animation-delay: 0.85s, 1.85s;
        }
        .converge-line:nth-child(4) {
          animation-delay: 0.9s, 1.9s;
        }
        .converge-line:nth-child(5) {
          animation-delay: 0.95s, 1.95s;
        }
        .converge-line:nth-child(6) {
          animation-delay: 1s, 2s;
        }
        .converge-line:nth-child(7) {
          animation-delay: 1.05s, 2.05s;
        }

        @keyframes drawLine {
          to {
            opacity: 0.7;
            stroke-dashoffset: 0;
          }
        }

        @keyframes pulseLine {
          0% {
            stroke-dashoffset: 12;
            opacity: 0.3;
          }
          50% {
            opacity: 0.7;
          }
          100% {
            stroke-dashoffset: 0;
            opacity: 0.3;
          }
        }

        /* Hexagon pulse animation after drawing */
        .hexagon-path {
          animation:
            drawHexagon 1.5s ease-out forwards,
            glowPulse 3s ease-in-out infinite;
          animation-delay: 0s, 1.5s;
        }

        @keyframes glowPulse {
          0%,
          100% {
            stroke-width: 1.5;
          }
          50% {
            stroke-width: 2;
          }
        }
      `}</style>
    </div>
  );
};

export default ProductLoadingScreen;
