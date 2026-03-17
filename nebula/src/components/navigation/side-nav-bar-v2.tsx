"use client";
import { useState, useRef, useEffect } from "react";
import { useDispatch } from "react-redux";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  Workflow,
  TestTube,
  KeyRound,
  Plug,
  Users,
  CreditCard,
  GraduationCap,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLoading } from "@/app/context/loading-context";
import { useUser, UserButton } from "@clerk/nextjs";
import { useProductSwitcher } from "@/providers/product-provider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";
import { isQaiOrgUser } from "@/lib/constants";
import { AppDispatch } from "@/app/store/store";
import { startTutorial } from "@/app/store/tutorialSlice";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const primaryNav = [
  { label: "Flows", href: "/flows", icon: Workflow },
  { label: "Test Runs", href: "/test-runs", icon: TestTube },
  { label: "Credentials", href: "/credentials", icon: KeyRound },
];

const secondaryNav = [
  { label: "Integrations", href: "/integrations", icon: Plug },
  { label: "Your Team", href: "/team", icon: Users },
  { label: "Usage & Billing", href: "/billing", icon: CreditCard },
];

const SideNavigationBarV2 = () => {
  const pathname = usePathname();
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();
  const { isAppLoading } = useLoading();
  const { user, isLoaded, isSignedIn } = useUser();
  const { productSwitcher } = useProductSwitcher();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const hasAutoSelectedFlowsRef = useRef(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    if (hasAutoSelectedFlowsRef.current) return;
    if (!productSwitcher.product_id) return;

    const showFlows = searchParams.get("showFlows");
    if (showFlows !== "true") return;

    const productRootPath = `/${productSwitcher.product_id}`;
    const hasProductIdInURL = pathname.startsWith(productRootPath);

    if (hasProductIdInURL) {
      hasAutoSelectedFlowsRef.current = true;
      return;
    }

    const query = searchParams.toString();
    router.replace(query ? `${productRootPath}?${query}` : productRootPath);
    hasAutoSelectedFlowsRef.current = true;
  }, [pathname, productSwitcher.product_id, router, searchParams]);

  // Check if user is QAI user
  const userOrgId = user?.publicMetadata?.organisation_id as string | undefined;
  const isQaiUser = isQaiOrgUser(userOrgId);

  // Determine if we're on new UI (homev2) or old UI (dashboard/editor)
  const isNewUI = !pathname.includes("/editor");

  const isStaging = process.env.NEXT_PUBLIC_APP_ENV !== "production";
  const shouldShowToggle = isStaging || isQaiUser;

  // Special paths that should not show the sidebar
  const isOnboardingPath = pathname.startsWith("/onboarding");
  const isAuthPath =
    pathname.includes("sign-in") || pathname.includes("sign-up");
  const isAuthRelatedPath =
    pathname.includes("verify") || pathname.includes("sso-callback");

  // Also hide sidebar if user is signed in but has no organization ID
  const hasNoOrganization =
    isLoaded && isSignedIn && user && !user.publicMetadata?.organisation_id;

  // Don't render sidebar for special paths, while loading, or if no organization
  if (
    isAuthPath ||
    isOnboardingPath ||
    isAuthRelatedPath ||
    isAppLoading ||
    hasNoOrganization
  ) {
    return null;
  }

  const handleOpenTutorial = () => {
    if (!productSwitcher.product_id) return;

    const isOnTestRuns = pathname.includes(
      `/${productSwitcher.product_id}/test-runs`,
    );
    const isOnFlows = pathname === `/${productSwitcher.product_id}`;

    if (isOnTestRuns) {
      dispatch(startTutorial("flow-details"));
      return;
    }

    if (isOnFlows) {
      const hasFlowDetailsOpen =
        typeof document !== "undefined" &&
        !!document.querySelector('[data-tutorial="step-controls"]');

      dispatch(startTutorial(hasFlowDetailsOpen ? "flows-details" : "flows"));
      return;
    }

    dispatch(startTutorial("flows"));
    router.push(`/${productSwitcher.product_id}?showFlows=true`);
  };

  const NavItemWrapper = ({
    children,
    label,
  }: {
    children: React.ReactNode;
    label: string;
  }) => {
    if (isCollapsed) {
      return (
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>{children}</TooltipTrigger>
          <TooltipContent side="right" sideOffset={10}>
            {label}
          </TooltipContent>
        </Tooltip>
      );
    }
    return <>{children}</>;
  };

  const getHref = (href: string) => {
    if (href.startsWith("/")) {
      if (href === "/flows") {
        // Use new UI (homev2) or old UI (editor) based on current state
        return isNewUI
          ? `/${productSwitcher.product_id}?showFlows=true`
          : `/${productSwitcher.product_id}/editor`;
      }
      if (href === "/test-runs") {
        // Always route Test Runs through the new UI shell
        return `/${productSwitcher.product_id}/test-runs`;
      }
      if (href === "/credentials") {
        return `/${productSwitcher.product_id}/credentials`;
      }
      if (href === "/integrations") {
        return `/${productSwitcher.product_id}/qai-integrations`;
      }
      if (href === "/team") {
        return `/team`;
      }
      if (href === "/billing") {
        return `/${productSwitcher.product_id}/usage`;
      }
      return href;
    }
    return href;
  };

  const handleUIToggle = (checked: boolean) => {
    if (checked) {
      // Switch to new UI (homev2)
      router.push(`/${productSwitcher.product_id}?showFlows=true`);
    } else {
      // Switch to old UI (dashboard)
      router.push(`/${productSwitcher.product_id}/editor`);
    }
  };

  const isActive = (href: string) => {
    const actualHref = getHref(href);
    const baseHref = actualHref.split("?")[0];

    if (href === "/flows") {
      return pathname === baseHref;
    }

    return pathname === baseHref || pathname.startsWith(`${baseHref}/`);
  };

  return (
    <TooltipProvider>
      <motion.aside
        initial={false}
        animate={{ width: isCollapsed ? 56 : 200 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="min-h-screen bg-sidebar border-r border-sidebar-border flex flex-col overflow-hidden"
      >
        {/* Logo */}
        <div className="h-16 flex items-center px-3 border-b border-sidebar-border justify-between flex-shrink-0">
          {!isCollapsed && (
            <motion.div
              initial={false}
              animate={{ opacity: isCollapsed ? 0 : 1 }}
              transition={{ duration: 0.15 }}
              className="flex items-center gap-2"
            >
              <Image
                unoptimized
                src={"/QAI-logo.svg"}
                height={24}
                width={24}
                alt="QAI Logo"
              />
              <span className="text-2xl font-bold text-foreground tracking-tight">
                QAI
              </span>
            </motion.div>
          )}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className={cn(
              "p-1.5 rounded-md hover:bg-muted transition-colors duration-fast flex-shrink-0",
              isCollapsed && "mx-auto",
            )}
          >
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronLeft className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto overflow-x-hidden">
          {primaryNav.map((item) => {
            const actualHref = getHref(item.href);
            const active = isActive(item.href);
            return (
              <NavItemWrapper key={item.href} label={item.label}>
                <Link
                  href={actualHref}
                  data-tutorial={
                    item.href === "/flows" ? "add-more-flows" : undefined
                  }
                  className={cn(
                    "nav-item relative",
                    isCollapsed && "gap-0 justify-center",
                    active && "active",
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {isCollapsed ? null : (
                    <motion.span
                      initial={false}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="whitespace-nowrap"
                    >
                      {item.label}
                    </motion.span>
                  )}
                </Link>
              </NavItemWrapper>
            );
          })}

          <div className="pt-4 space-y-0.5">
            {secondaryNav.map((item) => {
              const actualHref = getHref(item.href);
              const active = isActive(item.href);
              return (
                <NavItemWrapper key={item.href} label={item.label}>
                  <Link
                    href={actualHref}
                    className={cn(
                      "nav-item relative",
                      isCollapsed && "gap-0 justify-center",
                      active && "active",
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {isCollapsed ? null : (
                      <motion.span
                        initial={false}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="whitespace-nowrap"
                      >
                        {item.label}
                      </motion.span>
                    )}
                  </Link>
                </NavItemWrapper>
              );
            })}
            <NavItemWrapper label="Tutorial">
              <button
                onClick={handleOpenTutorial}
                className={cn(
                  "nav-item w-full relative",
                  isCollapsed && "gap-0 justify-center",
                )}
              >
                <GraduationCap className="h-4 w-4 shrink-0" />
                {isCollapsed ? null : (
                  <motion.span
                    initial={false}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="whitespace-nowrap"
                  >
                    Tutorial
                  </motion.span>
                )}
              </button>
            </NavItemWrapper>
          </div>

          {!isCollapsed && !isNewUI && shouldShowToggle && (
            <div
              className="pt-4 px-2 flex items-center gap-2 cursor-pointer"
              onClick={() => handleUIToggle(!isNewUI)}
            >
              <Switch
                id="ui-toggle"
                checked={isNewUI}
                onCheckedChange={handleUIToggle}
              />
              <Label
                htmlFor="ui-toggle"
                className="text-xs text-muted-foreground cursor-pointer"
              >
                New UI
              </Label>
            </div>
          )}
        </nav>

        {/* Profile Button */}
        <div className="border-t border-sidebar-border px-3 py-4 flex-shrink-0">
          <div
            className={cn(
              "flex items-center gap-3",
              isCollapsed ? "justify-center" : "justify-start",
            )}
          >
            <UserButton />
            {!isCollapsed && user && (
              <div className="flex flex-col min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {user.firstName || user.username || "User"}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {user.emailAddresses?.[0]?.emailAddress}
                </p>
              </div>
            )}
          </div>
        </div>
      </motion.aside>
    </TooltipProvider>
  );
};

export default SideNavigationBarV2;
