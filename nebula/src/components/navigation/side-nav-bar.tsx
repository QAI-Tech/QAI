"use client";
import { LayoutDashboard, Play, TestTube2, Wand2, Wallet } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import Navigation from "@/components/navigation";
import ProductDropDown from "@/components/global/product-dropdown";
import OrganizationDropDown from "@/components/global/organization-dropdown";
import NavItem from "./nav-item";
import AddProductDialog from "@/components/global/AddProductDialog";
import { useLoading } from "@/app/context/loading-context";
import { useUser } from "@clerk/nextjs";
import { useProductSwitcher } from "@/providers/product-provider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { isQaiOrgUser } from "@/lib/constants";
import { useEffect } from "react";
import { useDispatch } from "react-redux";
import { AppDispatch } from "@/app/store/store";
import { fetchOrganizations } from "@/app/store/organizationSlice";
import * as Sentry from "@sentry/nextjs";

const SideNavigationBar = () => {
  const pathname = usePathname();
  const router = useRouter();
  const { isAppLoading } = useLoading();
  const { user, isLoaded, isSignedIn } = useUser();
  const { productSwitcher } = useProductSwitcher();
  const dispatch = useDispatch<AppDispatch>();

  // Check if user is QAI user
  const userOrgId = user?.publicMetadata?.organisation_id as string | undefined;
  const isQaiUser = isQaiOrgUser(userOrgId);

  // Fetch organizations for QAI users
  useEffect(() => {
    if (isQaiUser) {
      try {
        dispatch(fetchOrganizations());
      } catch (error) {
        console.error("Error fetching organizations:", error);
        Sentry.captureException(error, {
          level: "error",
          tags: { action: "fetch_organizations" },
        });
      }
    }
  }, [isQaiUser, dispatch]);

  // Determine if we're on new UI (homev2) or old UI (dashboard/editor)
  const isNewUI = !pathname.includes("/editor");

  const isStaging = process.env.NEXT_PUBLIC_APP_ENV !== "production";
  const shouldShowToggle = isStaging || isQaiUser;

  const handleUIToggle = (checked: boolean) => {
    if (checked) {
      // Switch to new UI (homev2)
      router.push(`/${productSwitcher.product_id}?showFlows=true`);
    } else {
      // Stay on old UI (dashboard)
      router.push(`/${productSwitcher.product_id}/editor`);
    }
  };

  // Special paths that should not show the sidebar
  const isOnboardingPath = pathname.startsWith("/onboarding");
  const isAuthPath =
    pathname.includes("sign-in") || pathname.includes("sign-up");
  const isAuthRelatedPath =
    pathname.includes("verify") || pathname.includes("sso-callback");
  const isHomeV2 =
    !pathname.includes("/editor") && !pathname.includes("/homev1");

  // Also hide sidebar if user is signed in but has no organization ID
  const hasNoOrganization =
    isLoaded && isSignedIn && user && !user.publicMetadata?.organisation_id;

  // Don't render sidebar for special paths, while loading, or if no organization
  if (
    isAuthPath ||
    isOnboardingPath ||
    isAuthRelatedPath ||
    isAppLoading ||
    hasNoOrganization ||
    isHomeV2
  ) {
    return null;
  }

  return (
    <aside className="w-64 border-r h-full bg-white overflow-y-auto">
      <Navigation />
      <div className="p-6 flex flex-col space-y-2">
        {isQaiUser && <OrganizationDropDown />}
        <div className="flex items-center">
          <div className="flex-grow-0 flex-shrink-0">
            <ProductDropDown />
          </div>
          <div className="relative top-4 ml-2 flex-shrink-0">
            <AddProductDialog />
          </div>
        </div>
      </div>
      <nav className="mt-2 space-y-1 px-3">
        <NavItem
          href={`/${productSwitcher.product_id}/homev1`}
          icon={LayoutDashboard}
          text="Dashboard"
        />
        <NavItem
          href={`/${productSwitcher.product_id}/homev1/test-runs`}
          icon={Play}
          text="Test Runs"
        />
        <NavItem
          href={`/${productSwitcher.product_id}/homev1/test-cases`}
          icon={TestTube2}
          text="Test Cases"
        />
        {/* <NavItem
          href="/test-case-planning"
          icon={ClipboardCheck}
          text="AI Test Case Planning"
        /> */}
        <NavItem
          href={`/${productSwitcher.product_id}/homev1/qai-integrations`}
          icon={Wand2}
          text="Integrations"
        />
        {/* <NavItem href="/team" icon={Users} text="Your Team" /> */}
        <NavItem
          href={`/${productSwitcher.product_id}/homev1/usage-billing`}
          icon={Wallet}
          text="Usage"
        />
      </nav>

      {/* UI Toggle - All users in staging, only QAI users in production */}
      {shouldShowToggle && (
        <div
          className="pt-4 px-3 pb-4 flex items-center gap-2 cursor-pointer"
          onClick={() => handleUIToggle(!isNewUI)}
        >
          <Switch
            id="ui-toggle-old"
            checked={isNewUI}
            onCheckedChange={handleUIToggle}
          />
          <Label
            htmlFor="ui-toggle-old"
            className="text-xs text-muted-foreground cursor-pointer"
          >
            New UI
          </Label>
        </div>
      )}
    </aside>
  );
};

export default SideNavigationBar;
