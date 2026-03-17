import "../globals.css";
import ProductProvider from "@/providers/product-provider";
import ReduxProvider from "../../providers/redux-provider";
import DataProvider from "../../providers/data-provider";
import { Toaster as SonnarToaster } from "@/components/ui/sonner";
import { ClerkProvider } from "@clerk/nextjs";
import { LoadingProvider } from "@/app/context/loading-context";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      signUpFallbackRedirectUrl="/sign-up"
      signUpForceRedirectUrl="/onboarding?step=1"
      signInFallbackRedirectUrl="/sign-in"
      signInForceRedirectUrl="/"
    >
      <html lang="en" suppressHydrationWarning>
        <body className="min-h-screen bg-background">
          <ProductProvider>
            <ReduxProvider>
              <DataProvider>
                <LoadingProvider>
                  <Toaster />
                  <TooltipProvider>{children}</TooltipProvider>
                  <SonnarToaster position="bottom-right" />
                </LoadingProvider>
              </DataProvider>
            </ReduxProvider>
          </ProductProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
