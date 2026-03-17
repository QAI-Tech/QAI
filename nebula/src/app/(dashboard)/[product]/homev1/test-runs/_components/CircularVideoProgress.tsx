import { useSelector } from "react-redux";
import { Video } from "lucide-react";
import { selectUploadsByTcueId } from "@/app/store/videoUploadSlice";
import { RootState } from "@/app/store/store";
import { motion } from "framer-motion";

interface CircularVideoProgressProps {
  tcueId: string;
  className?: string;
}

export const CircularVideoProgress = ({
  tcueId,
  className = "",
}: CircularVideoProgressProps) => {
  const uploads = useSelector((state: RootState) =>
    selectUploadsByTcueId(state, tcueId),
  );

  // Find the active upload (if any)
  const activeUpload = uploads.find(
    (upload) => upload.status === "uploading" || upload.status === "pending",
  );

  if (!activeUpload) {
    // If no active upload, render regular video icon
    return <Video className={`h-5 w-5 ${className}`} />;
  }

  const progress = Math.round(activeUpload.progress);

  return (
    <div className="relative flex items-center justify-center w-8 h-8">
      {/* SVG for circular progress */}
      <svg width="28" height="28" viewBox="0 0 28 28" className="absolute">
        {/* Background circle */}
        <circle
          cx="14"
          cy="14"
          r="11"
          fill="transparent"
          stroke="#e5e7eb"
          strokeWidth="2.5"
        />

        {/* Animated progress circle */}
        <motion.circle
          cx="14"
          cy="14"
          r="11"
          fill="transparent"
          stroke="#7c3aed" // Purple color
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={2 * Math.PI * 11}
          strokeDashoffset={2 * Math.PI * 11 * (1 - progress / 100)}
          initial={{ strokeDashoffset: 2 * Math.PI * 11 }}
          animate={{
            strokeDashoffset: 2 * Math.PI * 11 * (1 - progress / 100),
          }}
          transition={{
            type: "spring",
            stiffness: 50,
            damping: 20,
          }}
        />
      </svg>

      {/* Video icon in the middle */}
      <Video className="h-4 w-4 text-gray-600 z-10" />

      {/* Percentage text */}
      <div className="absolute -bottom-1 -right-1 bg-purple-600 rounded-full w-4 h-4 flex items-center justify-center shadow-sm">
        <span className="text-[8px] font-bold text-white">{progress}%</span>
      </div>
    </div>
  );
};
