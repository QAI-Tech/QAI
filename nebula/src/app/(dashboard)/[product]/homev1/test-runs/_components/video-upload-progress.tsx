import { useSelector } from "react-redux";
import { AlertCircle, Loader2, Upload } from "lucide-react";
import { selectUploadsByTcueId } from "@/app/store/videoUploadSlice";
import { RootState } from "@/app/store/store";
import { motion } from "framer-motion";

interface VideoUploadProgressProps {
  tcueId: string;
}

export const VideoUploadProgress = ({ tcueId }: VideoUploadProgressProps) => {
  const uploads = useSelector((state: RootState) =>
    selectUploadsByTcueId(state, tcueId),
  );

  const activeUploads = uploads.filter(
    (upload) => upload.status !== "completed",
  );

  if (activeUploads.length === 0) return null;

  return (
    <div className="w-full mb-2">
      {activeUploads.map((upload) => (
        <div key={upload.id} className="relative w-full">
          {upload.status === "uploading" && (
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-purple-600/10 to-blue-600/10 rounded-lg"
              animate={{ opacity: [0.3, 0.7, 0.3] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
          )}

          <div className="bg-white p-2 rounded-lg border-t relative z-10">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                {upload.status === "uploading" && (
                  <Loader2 className="h-4 w-4 animate-spin text-purple-600" />
                )}
                {upload.status === "failed" && (
                  <AlertCircle className="h-4 w-4 text-red-500" />
                )}
                {upload.status === "pending" && (
                  <Upload className="h-4 w-4 text-gray-400" />
                )}

                <span className="text-xs font-medium">
                  {upload.status === "uploading"
                    ? "Uploading video..."
                    : upload.status === "failed"
                      ? "Upload failed"
                      : "Preparing upload..."}
                </span>
              </div>

              {upload.status === "uploading" && (
                <span className="text-xs font-semibold text-purple-600">
                  {Math.round(upload.progress)}%
                </span>
              )}
            </div>

            {upload.status === "uploading" && (
              <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full"
                  initial={{ width: "0%" }}
                  animate={{ width: `${upload.progress}%` }}
                  transition={{ type: "spring", stiffness: 50, damping: 20 }}
                />
              </div>
            )}

            {upload.status === "failed" && upload.error && (
              <p className="text-xs text-red-500 mt-1">{upload.error}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
