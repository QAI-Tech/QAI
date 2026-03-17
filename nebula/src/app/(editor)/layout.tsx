// @ts-nocheck
import "../globals.css";
import ProductProvider from "@/providers/product-provider";
import ReduxProvider from "../../providers/redux-provider";
import DataProvider from "../../providers/data-provider";
import { Toaster as SonnarToaster } from "@/components/ui/sonner";
import { ClerkProvider } from "@clerk/nextjs";
import { LoadingProvider } from "@/app/context/loading-context";
import Providers from "./provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      signUpFallbackRedirectUrl="/sign-up"
      signUpForceRedirectUrl="/onboarding?step=1"
      signInFallbackRedirectUrl="/sign-in"
      signInForceRedirectUrl="/"
    >
      <html lang="en" suppressHydrationWarning>
        <body className="min-h-screen">
          <Providers>
            <ProductProvider>
              <ReduxProvider>
                <DataProvider>
                  <LoadingProvider>
                    <Toaster />
                    <Sonner />
                    <TooltipProvider>{children}</TooltipProvider>
                    <SonnarToaster position="bottom-right" />
                  </LoadingProvider>
                </DataProvider>
              </ReduxProvider>
            </ProductProvider>
          </Providers>
        </body>
      </html>
    </ClerkProvider>
  );
}
