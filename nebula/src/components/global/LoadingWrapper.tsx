"use client";

import { useEffect } from "react";
import { useLoading } from "@/app/context/loading-context";
import { usePathname, useRouter } from "next/navigation";
import { useSelector } from "react-redux";
import { RootState } from "@/app/store/store";
import { useUser } from "@clerk/nextjs";
import ProductLoadingScreen from "./ProductLoadingScreen";

export default function LoadingWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { isLoaded, isSignedIn, user } = useUser();
  const { isAppLoading, setAppLoading } = useLoading();
  const productsState = useSelector((state: RootState) => state.products);

  // Special paths that should always be rendered without loading screens
  const isOnboardingPath = pathname.startsWith("/onboarding");
  const isAuthPath =
    pathname.includes("sign-in") || pathname.includes("sign-up");
  const isAuthRelatedPath =
    pathname.includes("verify") || pathname.includes("sso-callback");
  const isSpecialPath = isOnboardingPath || isAuthPath || isAuthRelatedPath;

  // Handle organization ID check and redirect
  useEffect(() => {
    if (isLoaded && isSignedIn && user) {
      const organisationId = user?.publicMetadata?.organisation_id;

      // If there's no organisation ID and we're not already on the onboarding path then redirect to onboarding
      if (!organisationId && !isOnboardingPath) {
        console.log("No organisation ID found, redirecting to onboarding");
        router.push("/onboarding?step=1");
      }
    }
  }, [isLoaded, isSignedIn, user, router, isOnboardingPath]);

  // Update application loading state
  useEffect(() => {
    // Skip loading for special paths
    if (isSpecialPath) {
      setAppLoading(false);
      return;
    }

    // Not loaded yet, show loading screen
    if (!isLoaded) {
      setAppLoading(true);
      return;
    }

    // Not signed in, and will not  show loading
    if (!isSignedIn) {
      setAppLoading(false);
      return;
    }

    // Check for organization ID - if missing, don't show loading (it will redirect)
    const organisationId = user?.publicMetadata?.organisation_id;
    if (!organisationId) {
      setAppLoading(false);
      return;
    }

    // Handle product loading state
    if (productsState.loading) {
      setAppLoading(true);
    } else {
      setAppLoading(false);
    }
  }, [
    isLoaded,
    isSignedIn,
    user,
    productsState.loading,
    pathname,
    setAppLoading,
    isSpecialPath,
  ]);

  // Skip loading screens for special paths
  if (isSpecialPath) {
    return <>{children}</>;
  }

  // Show loading screen while app is loading
  if (isAppLoading) {
    return <ProductLoadingScreen />;
  }

  // Render children when everything is loaded
  return <>{children}</>;
}
