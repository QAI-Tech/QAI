import React, { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload, Sparkles, Video } from "lucide-react";
import { validateVideoDuration } from "@/lib/utils";
import { toast } from "sonner";

interface WelcomeVideoUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddFlowsFromVideo: (files: File[], flowName?: string) => void;
}

const WelcomeVideoUploadModal: React.FC<WelcomeVideoUploadModalProps> = ({
  isOpen,
  onClose,
  onAddFlowsFromVideo,
}) => {
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  if (!isOpen) return null;

  const handleVideoUploadClick = () => {
    videoInputRef.current?.click();
  };

  const handleVideoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      const file = files[0];
      const validation = await validateVideoDuration(file);
      if (!validation.isValid) {
        toast.error(validation.errorMessage || "Invalid video file");
        if (videoInputRef.current) {
          videoInputRef.current.value = "";
        }
        return;
      }
      setSelectedFile(file);
    }
    if (videoInputRef.current) {
      videoInputRef.current.value = "";
    }
  };

  const handleGenerateFlow = async () => {
    if (selectedFile) {
      const validation = await validateVideoDuration(selectedFile);
      if (!validation.isValid) {
        toast.error(validation.errorMessage || "Invalid video file");
        setSelectedFile(null);
        if (videoInputRef.current) {
          videoInputRef.current.value = "";
        }
        return;
      }

      const files = [selectedFile];
      setTimeout(() => {
        onClose();
      }, 300);

      // Call the upload function AFTER setting the timeout
      onAddFlowsFromVideo(files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files || []);
    const videoFiles = files.filter((file) => file.type.startsWith("video/"));

    if (videoFiles.length > 0) {
      const file = videoFiles[0];
      const validation = await validateVideoDuration(file);
      if (!validation.isValid) {
        toast.error(validation.errorMessage || "Invalid video file");
        return;
      }
      setSelectedFile(file);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md">
      <div className="bg-background rounded-xl p-8 max-w-md w-full shadow-2xl border border-purple-200">
        <h2 className="text-2xl font-bold mb-3 text-center text-purple-600">
          Welcome to QAI Flow Editor
        </h2>
        <p className="text-gray-600 mb-6 text-center">
          Let's start by creating your first flow. Upload a video of your app to
          automatically generate a flow graph.
        </p>

        <div className="flex flex-col items-center gap-6">
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            multiple
            onChange={handleVideoChange}
            className="hidden"
          />

          <div
            className={`w-full h-48 border-2 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer transition-all duration-200 ${
              isDragging
                ? "border-purple-500 bg-purple-50"
                : selectedFile
                  ? "border-green-500 bg-green-50"
                  : "border-purple-200 hover:border-purple-400 hover:bg-purple-50"
            }`}
            onClick={handleVideoUploadClick}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {selectedFile ? (
              <div className="flex flex-col items-center gap-2 text-green-600">
                <Video className="h-10 w-10" />
                <p className="text-sm font-medium">{selectedFile.name}</p>
                <p className="text-xs text-gray-500">
                  {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                </p>
              </div>
            ) : (
              <>
                <Upload className="h-10 w-10 text-purple-500 mb-2" />
                <p className="text-sm font-medium text-gray-700">
                  Drop your video here or click to browse
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Supported formats: mp4, mov
                </p>
              </>
            )}
          </div>

          <div className="w-full space-y-3">
            <Button
              onClick={handleGenerateFlow}
              className={`w-full py-6 bg-purple-600 hover:bg-purple-700 text-white flex items-center justify-center transition-all ${
                !selectedFile ? "opacity-60 cursor-not-allowed" : "opacity-100"
              }`}
              disabled={!selectedFile}
            >
              <Sparkles className="h-5 w-5 mr-2" />
              Generate Flow
            </Button>

            <Button
              variant="outline"
              onClick={onClose}
              className="w-full py-6 border-gray-300"
            >
              Skip for now
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WelcomeVideoUploadModal;
