"use client";
import { cn } from "@/lib/utils";
import React from "react";
import { SignedOut, SignInButton, UserButton } from "@clerk/nextjs";
import Image from "next/image";
// import Home from "@/app/(static)/new-design/get-started/page";
import { useProductSwitcher } from "@/providers/product-provider";
import { ArrowLeft } from "lucide-react";
import { usePathname } from "next/navigation";

interface NavigationProps {
  showBackToQAIButton?: boolean;
  hideProductName?: boolean;
  productDropdown?: React.ReactNode;
  featureDropdown?: React.ReactNode;
  rightActions?: React.ReactNode;
}

const Navigation: React.FC<NavigationProps> = ({
  showBackToQAIButton = false,
  hideProductName = false,
  productDropdown,
  featureDropdown,
  rightActions,
}) => {
  const { productSwitcher } = useProductSwitcher();
  const pathname = usePathname();
  const isHomeV2 = !pathname.includes("/editor");
  const shouldHideProductName = hideProductName || isHomeV2;

  return (
    <>
      <div className="h-[4rem]"></div>
      <div
        className={cn(
          "fixed top-0 right-0 left-0 p-4 flex items-center bg-secondary-background shadow-sm shadow-primary/5 backdrop-blur-md justify-between z-10 transition-all",
        )}
      >
        {/* <Home /> */}
        <aside className={cn("flex items-center gap-2")}>
          <Image
            unoptimized
            src={"/QAI-logo.svg"}
            height={32}
            width={32}
            alt="QAI Logo"
          />
          <span className="text-xl font-bold">QAI</span>
          {showBackToQAIButton && (
            <div className="border-l border-gray-300 ml-4 pl-4">
              <div className="relative group ml-2 mt-2">
                <button
                  className="text-lg font-bold text-gray-700 hover:text-primary hover:underline transition"
                  onClick={() => (window.location.href = "/")}
                  aria-label="Back to QAI"
                >
                  <ArrowLeft className="w-5 h-5" strokeWidth={3} />
                </button>
                <div className="absolute left-1/2 -translate-x-1/2 mt-2 px-2 py-1 rounded bg-gray-800 text-white text-xs opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
                  Back To QAI
                </div>
              </div>
            </div>
          )}
          {productDropdown ? (
            <div className="border-l border-gray-300 ml-4 pl-4">
              {productDropdown}
            </div>
          ) : (
            productSwitcher.product_name &&
            !shouldHideProductName && (
              <div className="border-l border-gray-300 ml-4 pl-4">
                <span className="text-lg font-bold text-gray-700">
                  {productSwitcher.product_name}
                </span>
              </div>
            )
          )}
          {featureDropdown && (
            <div className="border-l border-gray-300 ml-4 pl-4">
              {featureDropdown}
            </div>
          )}
        </aside>

        <aside className="flex gap-2 items-center">
          {rightActions && (
            <div className="flex gap-2 items-center mr-4">{rightActions}</div>
          )}
          <SignedOut>
            <SignInButton>
              <button className="px-4 py-2 rounded-full bg-secondary-foreground text-secondary text-sm">
                Sign In
              </button>
            </SignInButton>
          </SignedOut>
          <UserButton />
        </aside>
      </div>
    </>
  );
};

export default Navigation;
