import type { Metadata } from "next";
import "../globals.css";
import { Toaster as SonnarToaster } from "@/components/ui/sonner";
import { ClerkProvider } from "@clerk/nextjs";
import ProductProvider from "@/providers/product-provider";
import ReduxProvider from "../../providers/redux-provider";
import DataProvider from "../../providers/data-provider";
import { LoadingProvider } from "@/app/context/loading-context";
import LoadingWrapper from "@/components/global/LoadingWrapper";
import DashboardClientLayout from "./dashboard-client-layout";

export const metadata: Metadata = {
  title: "QAI",
  description:
    "Your autopilot for mobile quality assurance with automated test planning, test execution, and reporting.",
  icons: {
    icon: "/QAI-logo.svg",
    apple: "/QAI-logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider
      signUpFallbackRedirectUrl="/sign-up"
      signUpForceRedirectUrl="/onboarding?step=1"
      signInFallbackRedirectUrl="/sign-in"
      signInForceRedirectUrl="/"
    >
      <html lang="en" suppressHydrationWarning>
        <body>
          <ProductProvider>
            <ReduxProvider>
              <DataProvider>
                <LoadingProvider>
                  <LoadingWrapper>
                    <DashboardClientLayout>{children}</DashboardClientLayout>
                  </LoadingWrapper>
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
