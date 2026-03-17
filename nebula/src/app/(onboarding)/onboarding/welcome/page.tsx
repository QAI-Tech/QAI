"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { QAI_WEB_VIDEO_URL, QAI_MOBILE_VIDEO_URL } from "@/lib/constants";

const ReactPlayer = dynamic(() => import("react-player"), { ssr: false });

export default function WelcomePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [userName, setUserName] = useState("");
  const [productId, setProductId] = useState("");
  const [platform, setPlatform] = useState("");
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const name = searchParams.get("name") || "there";
    const id = searchParams.get("productId") || "";
    const platformParam = searchParams.get("platform") || "web";

    setUserName(name);
    setProductId(id);
    setPlatform(platformParam);
    setIsReady(true);
  }, [searchParams]);

  const handleGetStarted = () => {
    router.push(`/${productId}?showFlows=true`);
  };

  const videoUrl =
    platform === "web" ? QAI_WEB_VIDEO_URL : QAI_MOBILE_VIDEO_URL;

  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="flex flex-col md:flex-row w-full max-w-7xl mx-auto p-4 md:p-8 gap-8">
        <div className="flex-1 flex flex-col justify-center">
          <h1 className="text-4xl font-bold mb-8">Hi {userName}!</h1>

          <div className="flex items-center gap-4 mb-6">
            <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z"
                  stroke="#7C3AED"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <p className="text-base">
              You&apos;ve just started a 14-day free trial of advanced testing
              features.
            </p>
          </div>

          <div className="flex items-center gap-4 mb-6">
            <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M12 15V17M6 9V7C6 5.89543 6.89543 5 8 5H16C17.1046 5 18 5.89543 18 7V9C18 10.1046 17.1046 11 16 11H8C6.89543 11 6 10.1046 6 9ZM6 9C6 10.1046 6.89543 11 8 11H16C17.1046 11 18 10.1046 18 9M6 9H18M10 15H14M8 19H16C17.1046 19 18 18.1046 18 17V11M6 13V17C6 18.1046 6.89543 19 8 19"
                  stroke="#7C3AED"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <p className="text-base">
              Try all the premium features before you decide which plan is right
              for you.
            </p>
          </div>

          <div className="flex items-center gap-4 mb-10">
            <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
              <span className="text-purple-600 font-bold text-sm">FREE</span>
            </div>
            <p className="text-base">
              When your trial ends, we&apos;ll automatically move you to the
              FREE plan.
            </p>
          </div>

          <p className="mb-8 text-base">
            Quick start with our 2-minute video guide
          </p>

          <Button
            onClick={handleGetStarted}
            className="bg-purple-600 hover:bg-purple-700 text-white py-6 px-8 rounded-md w-fit"
          >
            Awesome, let&apos;s start
          </Button>
        </div>

        <div className="flex-1 flex items-center justify-center">
          <div
            className="w-full aspect-video rounded-lg overflow-hidden bg-black shadow-2xl"
            onContextMenu={handleContextMenu}
          >
            {isReady && (
              <ReactPlayer
                src={videoUrl}
                width="100%"
                height="100%"
                controls={true}
                playing={false}
                light={false}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
