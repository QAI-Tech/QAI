import { TestCaseFrame } from "@/app/(dashboard)/[product]/homev1/test-runs/_components/test-case-frame";
interface ScreenPreviewProps {
  mainImage?: string;
  videoUri?: string;
  isDialog?: boolean; // Added this variable to show diff size of screen preview
}

export function ScreenPreview({
  mainImage,
  videoUri,
  isDialog = false,
}: ScreenPreviewProps) {
  return (
    <div className={`flex flex-col ${isDialog ? "items-center" : ""} w-full`}>
      <h2
        className={`text-sm font-medium text-gray-700 mb-2 ${isDialog ? "text-center" : ""}`}
      >
        Test Case Frame
      </h2>
      <div className="rounded-lg border-2 border-blue-400 p-4 w-full">
        <div
          className={`relative aspect-[9/16] w-full ${isDialog ? "max-h-[320px]" : "max-h-[500px]"} overflow-hidden rounded-lg`}
        >
          {mainImage ? (
            <div
              className={`h-full overflow-auto ${isDialog ? "flex justify-center" : ""}`}
            >
              <TestCaseFrame
                screenshotUrl={
                  videoUri && videoUri?.trim() !== "" ? videoUri : mainImage
                }
              />
            </div>
          ) : (
            <div className="flex h-full items-center justify-center bg-gray-50">
              <p className="text-gray-500">No image uploaded</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
