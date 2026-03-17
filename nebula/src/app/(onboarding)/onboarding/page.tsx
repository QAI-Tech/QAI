"use client";

import type React from "react";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn, ValidationHelpers } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUser } from "@clerk/nextjs";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import Loading from "@/components/global/loading";
import { ChevronDown } from "lucide-react";
import type { OnboardingData } from "@/lib/types";
import { Checkbox } from "@/components/ui/checkbox";
import * as Sentry from "@sentry/nextjs";
import MixpanelService from "@/lib/mixpanel";
import { useDispatch } from "react-redux";
import { AppDispatch } from "@/app/store/store";
import { GRAPH_COLLABORATION_SERVER_URL } from "@/lib/constants";
import { addGraphFeature } from "@/app/store/graphFeaturesSlice";

export default function MultiStepForm() {
  const searchParams = useSearchParams();

  // Step tracking
  const [stepNum, setStepNum] = useState(1);
  const [showAdvancedSection, setShowAdvancedSection] = useState(false);

  useEffect(() => {
    const step = searchParams.get("step");
    if (step && !isNaN(Number.parseInt(step))) {
      setStepNum(Number.parseInt(step));
    }
  }, [searchParams]);

  // Form data state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [organization, setOrganization] = useState("");
  const [organisationId, setOrganisationId] = useState("");
  const [productName, setProductName] = useState("");
  const [platform, setPlatform] = useState("");
  const [url, setUrl] = useState("");
  const [testUsername, setTestUsername] = useState("");
  const [testPassword, setTestPassword] = useState("");
  const [acceptanceCriteria, setAcceptanceCriteria] = useState("");

  const { user } = useUser();
  const firstNameClerk = user?.publicMetadata?.first_name || "Guest";
  const lastNameClerk = user?.publicMetadata?.last_name || "";
  const organisationIdClerk = user?.publicMetadata?.organisation_id || "";
  const inviteOrgId = (user?.publicMetadata?.invite_org_id as string) || "";
  const email = user?.publicMetadata?.userEmail || "";
  const roles = (user?.publicMetadata?.roles as string[]) || ["Tester"];
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();

  // Error states
  const [firstNameError, setFirstNameError] = useState("");
  const [lastNameError, setLastNameError] = useState("");
  const [orgError, setOrgError] = useState("");
  const [nameError, setNameError] = useState("");
  const [urlError, setUrlError] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [acceptanceCriteriaError, setAcceptanceCriteriaError] = useState("");

  // Loading state
  const [isLoading, setIsLoading] = useState(false);
  const [setAsDefault, setSetAsDefault] = useState(false);

  useEffect(() => {
    setFirstName(firstNameClerk as string);
    setLastName(lastNameClerk as string);
    setOrganisationId(organisationIdClerk as string);
  }, [firstNameClerk, lastNameClerk, organisationIdClerk]);

  const getUrlKey = (platform: string) => {
    switch (platform) {
      case "iOS":
        return "apple_app_store_url";
      case "android":
        return "google_play_store_url";
      case "web":
        return "web_url";
      default:
        return "web_url";
    }
  };

  // Validation functions
  const validateFirstName = (value: string) => {
    if (!value.trim()) {
      return "First name is required";
    }
    if (!ValidationHelpers.isValidGeneralName(value)) {
      return "First name must not exceed 1000 characters.";
    }
    return "";
  };

  const validateLastName = (value: string) => {
    if (!value.trim()) {
      return "Last name is required";
    }
    if (!ValidationHelpers.isValidGeneralName(value)) {
      return "Last name must not exceed 1000 characters.";
    }
    return "";
  };

  const validateOrganization = (value: string) => {
    if (!value.trim()) {
      return "Organization name is required";
    }
    if (!ValidationHelpers.isValidGeneralName(value)) {
      return "Organization name must not exceed 1000 characters.";
    }
    return "";
  };

  const validateProductName = (value: string) => {
    if (!value.trim()) {
      return "Product name is required";
    }
    if (!ValidationHelpers.isValidGeneralName(value)) {
      return "Product name must not exceed 1000 characters.";
    }
    return "";
  };

  const validateUrl = (value: string, platform: string) => {
    if (!value.trim()) {
      return "URL is required";
    }

    switch (platform) {
      case "iOS":
        if (!ValidationHelpers.isValidAppStoreUrl(value)) {
          return "Please enter a valid App Store URL";
        }
        break;
      case "android":
        if (!ValidationHelpers.isValidPlayStoreUrl(value)) {
          return "Please enter a valid Play Store URL";
        }
        break;
      case "web":
        if (!ValidationHelpers.isValidWebUrl(value)) {
          return "Please enter a valid web URL";
        }
        break;
      default:
        return "Please select a platform";
    }
    return "";
  };

  const validateUsername = (value: string) => {
    if (value.trim() && !ValidationHelpers.isValidGeneralName(value)) {
      return "Username must not exceed 1000 characters.";
    }
    return "";
  };

  const validateAcceptanceCriteria = (value: string) => {
    if (value.trim() && !ValidationHelpers.isValidOptionalText(value)) {
      return "Acceptance criteria must have at least 1 character";
    }
    return "";
  };

  // Then modify the function to use this interface:
  const handleUserOnboarding = async () => {
    setIsLoading(true);

    const onboardingData: OnboardingData = {
      firstName,
      lastName,
      email: (email || user?.primaryEmailAddress?.emailAddress || "") as string,
      roles,
    };

    const effectiveOrgId = inviteOrgId || organisationId;
    if (effectiveOrgId) {
      onboardingData.organisation_id = effectiveOrgId;
    } else {
      onboardingData.organization_name = organization;
      onboardingData.product_name = productName;

      const urlKey = getUrlKey(platform);

      const normalizedUrl = ValidationHelpers.normalizeUrl(url);
      // Type safety for dynamic property assignment
      if (urlKey === "apple_app_store_url") {
        onboardingData.apple_app_store_url = normalizedUrl;
      } else if (urlKey === "google_play_store_url") {
        onboardingData.google_play_store_url = normalizedUrl;
      } else {
        onboardingData.web_url = normalizedUrl;
      }

      // Add credentials if provided
      if (testUsername.trim() || testPassword.trim()) {
        onboardingData.default_credentials = {
          credentials: {
            username: testUsername,
            password: testPassword,
          },
          description: setAsDefault
            ? "Default product credentials"
            : "Product credentials",
          is_default: setAsDefault,
        };
      }
    }

    try {
      const response = await fetch("/api/onboard-new-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(onboardingData),
      });

      console.log("Response status:", response.status);
      const responseData = await response.json();
      console.log("Response data:", responseData);

      if (!response.ok) {
        throw new Error(responseData.error || "Failed to onboard user");
      }

      if (user) {
        // Track the sign-up event
        const trackSuccess = MixpanelService.track("User Signed Up", {
          user_id: user.id,
          email: email || user?.primaryEmailAddress?.emailAddress || "",
          first_name: firstName,
          last_name: lastName,
          organization_id:
            responseData.organisation_id || inviteOrgId || organisationId,
          organization_name: organization || "",
          product_name: productName || "",
          platform: platform || "",
          has_credentials: !!(testUsername || testPassword),
        });

        console.log("Event tracking success:", trackSuccess);
        if (!trackSuccess) {
          // Log to Sentry if tracking fails
          Sentry.captureMessage(
            "Mixpanel tracking failed for User Signed Up event",
            {
              level: "warning",
              tags: { component: "onboarding" },
            },
          );
        }
      }

      toast.success("Onboarding completed successfully!");

      // Set a flag to indicate this is a new user
      sessionStorage.setItem("isFirstTimeUser", "true");
      const productId = responseData.product?.product_id;

      // Create default feature "Feature 1" for the newly created product
      try {
        const createdProductId = productId;
        if (createdProductId) {
          const resp = await fetch(
            `${GRAPH_COLLABORATION_SERVER_URL}/api/graph-events/features/create`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                product_id: createdProductId,
                name: "New Feature",
                description: "",
              }),
            },
          );

          if (resp.ok) {
            const result = await resp.json().catch(() => null);
            if (result && result.success && result.feature) {
              dispatch(
                addGraphFeature({
                  id: result.feature.id,
                  name: result.feature.name,
                  nodeIds: [],
                  isCollapsed: false,
                }),
              );
            }
          } else {
            const txt = await resp.text().catch(() => resp.statusText);
            Sentry.captureMessage(
              `Default feature creation failed for product ${createdProductId}: ${txt}`,
              { level: "warning", tags: { component: "onboarding" } },
            );
          }
        }
      } catch (err) {
        Sentry.captureException(err, {
          level: "error",
          tags: { component: "onboarding" },
        });
      }

      router.push(
        `/onboarding/welcome?name=${encodeURIComponent(firstName)}&productId=${encodeURIComponent(productId)}&platform=${encodeURIComponent(platform)}`,
      );
    } catch (error) {
      console.error("Onboarding error:", error);
      Sentry.captureException(error, {
        level: "fatal",
        tags: { priority: "high" },
      });
      toast.error("Failed to complete onboarding. Please try again.");
      setIsLoading(false);
    }
  };

  // Handle step 1 submission (name form)
  const handleStep1Submit = async (e: React.FormEvent) => {
    e.preventDefault();

    const firstNameValidation = validateFirstName(firstName);
    const lastNameValidation = validateLastName(lastName);

    setFirstNameError(firstNameValidation);
    setLastNameError(lastNameValidation);

    if (firstNameValidation || lastNameValidation) {
      return;
    }

    if (inviteOrgId || organisationId) {
      await handleUserOnboarding();
    } else {
      setStepNum(2);
    }
  };

  // Handle step 2 submission (organization form)
  const handleStep2Submit = (e: React.FormEvent) => {
    e.preventDefault();

    const orgValidation = validateOrganization(organization);
    setOrgError(orgValidation);

    if (orgValidation) {
      return;
    }

    setStepNum(3);
  };

  // Handle step 3 submission (product form)
  const handleStep3Submit = async (e: React.FormEvent) => {
    e.preventDefault();

    const normalizedUrl = ValidationHelpers.normalizeUrl(url);
    if (normalizedUrl !== url) {
      setUrl(normalizedUrl);
    }

    const productNameValidation = validateProductName(productName);
    const urlValidation = validateUrl(normalizedUrl, platform);
    const usernameValidation = testUsername.trim()
      ? validateUsername(testUsername)
      : "";
    const acceptanceCriteriaValidation = acceptanceCriteria.trim()
      ? validateAcceptanceCriteria(acceptanceCriteria)
      : "";

    setNameError(productNameValidation);
    setUrlError(urlValidation);
    setUsernameError(usernameValidation);
    setAcceptanceCriteriaError(acceptanceCriteriaValidation);

    if (
      productNameValidation ||
      urlValidation ||
      usernameValidation ||
      acceptanceCriteriaValidation
    ) {
      return;
    }

    // Call the consolidated onboarding function
    await handleUserOnboarding();
  };

  // Helper function for platform URL label
  const getFormDataMapping = (platform: string) => {
    switch (platform) {
      case "iOS":
        return "iOS App Store url (Live)";
      case "android":
        return "Android Play Store url (Live)";
      case "web":
        return "Web url (Live)";
      default:
        return "URL (Live)";
    }
  };

  // Render the appropriate step
  const renderStep = () => {
    switch (stepNum) {
      case 1:
        return (
          <>
            <div className="text-center mt-16 mb-24">
              <h2 className="text-4xl md:text-4xl font-semibold">
                What&apos;s your name?
              </h2>
            </div>

            <div className="max-w-lg mx-auto w-full">
              <form className="space-y-12" onSubmit={handleStep1Submit}>
                <div className="flex flex-col sm:flex-row gap-4">
                  {/* First Name Field */}
                  <div className="flex-1">
                    <Label htmlFor="firstName" className="sr-only">
                      First name
                    </Label>
                    <Input
                      id="firstName"
                      placeholder="First name"
                      value={firstName}
                      onChange={(e) => {
                        setFirstName(e.target.value);
                        if (firstNameError) setFirstNameError("");
                      }}
                      className={cn(
                        "w-full",
                        firstNameError
                          ? "border-red-500 focus-visible:ring-red-500"
                          : "border-gray-300",
                      )}
                    />
                    {firstNameError && (
                      <p className="text-red-500 text-sm font-medium mt-1">
                        {firstNameError}
                      </p>
                    )}
                  </div>

                  {/* Last Name Field */}
                  <div className="flex-1">
                    <Label htmlFor="lastName" className="sr-only">
                      Last name
                    </Label>
                    <Input
                      id="lastName"
                      placeholder="Last name"
                      value={lastName}
                      onChange={(e) => {
                        setLastName(e.target.value);
                        if (lastNameError) setLastNameError("");
                      }}
                      className={cn(
                        "w-full",
                        lastNameError
                          ? "border-red-500 focus-visible:ring-red-500"
                          : "border-gray-300",
                      )}
                    />
                    {lastNameError && (
                      <p className="text-red-500 text-sm font-medium mt-1">
                        {lastNameError}
                      </p>
                    )}
                  </div>
                </div>

                {/* Submit Button */}
                <Button
                  type="submit"
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white py-6 rounded-md"
                  disabled={isLoading}
                >
                  Continue
                </Button>
              </form>
            </div>
          </>
        );

      case 2:
        if (organisationId !== "") {
          setStepNum(3);
        }
        return (
          <>
            <div className="text-center mt-16 mb-24">
              <h2 className="text-4xl md:text-5xl font-semibold">
                Where do you work{firstName ? ", " + firstName : ""}?
              </h2>
            </div>

            {/* Organization Form */}
            <div className="max-w-lg mx-auto w-full">
              <form onSubmit={handleStep2Submit} className="space-y-8">
                <div className="space-y-2">
                  <Input
                    placeholder="Organization name*"
                    value={organization}
                    onChange={(e) => {
                      setOrganization(e.target.value);
                      if (orgError) setOrgError("");
                    }}
                    className={cn(
                      "w-full",
                      orgError
                        ? "border-red-500 focus-visible:ring-red-500"
                        : "border border-gray-300",
                    )}
                  />
                  {orgError && (
                    <p className="text-red-500 text-sm font-medium">
                      {orgError}
                    </p>
                  )}
                </div>

                <div className="flex gap-4">
                  <Button
                    variant="outline"
                    className="flex-1 hover:bg-gray-100 py-6 rounded-md"
                    onClick={() => setStepNum(1)}
                  >
                    Back
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-6 rounded-md"
                    disabled={isLoading}
                  >
                    {isLoading ? "Submitting..." : "Submit"}
                  </Button>
                </div>
              </form>
            </div>
          </>
        );

      case 3:
        return (
          <>
            <div className="text-center mt-16 mb-24">
              <h2 className="text-4xl md:text-4xl font-bold">
                Tell us about the product that you would like to test
              </h2>
            </div>

            <div className="max-w-lg mx-auto w-full">
              <form onSubmit={handleStep3Submit} className="space-y-8">
                <div className="space-y-2">
                  <Input
                    value={productName}
                    onChange={(e) => {
                      setProductName(e.target.value);
                      if (nameError) setNameError("");
                    }}
                    placeholder="Product name*"
                    className={cn(
                      "w-full",
                      nameError
                        ? "border-red-500 focus-visible:ring-red-500"
                        : "border border-gray-300",
                    )}
                  />
                  {nameError && (
                    <p className="text-red-500 text-sm font-medium">
                      {nameError}
                    </p>
                  )}
                </div>

                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">Platform:</p>
                  </div>

                  <div className="space-y-3">
                    <Select
                      value={platform}
                      onValueChange={(value) => {
                        setPlatform(value);
                        if (urlError) setUrlError("");
                      }}
                    >
                      <SelectTrigger className="w-full border border-gray-300 rounded-md">
                        <SelectValue placeholder="Select platform" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="web">Web</SelectItem>
                        <SelectItem value="android">Android</SelectItem>
                        <SelectItem value="iOS">iOS</SelectItem>
                      </SelectContent>
                    </Select>

                    {platform && (
                      <Input
                        value={url}
                        onChange={(e) => {
                          setUrl(e.target.value);
                          if (urlError) setUrlError("");
                        }}
                        onBlur={(e) => {
                          const normalizedUrl = ValidationHelpers.normalizeUrl(
                            e.target.value,
                          );
                          if (normalizedUrl !== e.target.value) {
                            setUrl(normalizedUrl);
                          }
                        }}
                        placeholder={getFormDataMapping(platform)}
                        className={cn(
                          "w-full border border-gray-300 mt-2",
                          urlError
                            ? "border-red-500 focus-visible:ring-red-500"
                            : "",
                        )}
                      />
                    )}
                  </div>

                  {urlError && (
                    <p className="text-red-500 text-sm font-medium">
                      {urlError}
                    </p>
                  )}
                </div>

                {/* Advanced Button */}
                <Button
                  type="button"
                  variant="link"
                  className="text-purple-600 hover:text-purple-700 p-0 h-auto flex items-center"
                  onClick={() => setShowAdvancedSection(!showAdvancedSection)}
                >
                  Advanced
                  <div
                    className={`ml-1 transition-transform ${showAdvancedSection ? "rotate-180" : ""}`}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </div>
                </Button>

                {/* Advanced Section */}
                {showAdvancedSection && (
                  <div className="space-y-4">
                    {/* Test Credentials  */}
                    <div>
                      <p className="font-medium mb-2">Test Credentials :</p>
                      <div className="flex flex-col sm:flex-row gap-4">
                        <div className="flex-1">
                          <Input
                            placeholder="Username/email"
                            className={cn(
                              "border border-gray-300",
                              usernameError
                                ? "border-red-500 focus-visible:ring-red-500"
                                : "",
                            )}
                            value={testUsername}
                            onChange={(e) => {
                              setTestUsername(e.target.value);
                              if (usernameError) setUsernameError("");
                            }}
                          />
                          {usernameError && (
                            <p className="text-red-500 text-sm font-medium mt-1">
                              {usernameError}
                            </p>
                          )}
                        </div>
                        <Input
                          placeholder="Password"
                          className="flex-1 border border-gray-300"
                          type="password"
                          value={testPassword}
                          onChange={(e) => setTestPassword(e.target.value)}
                        />
                      </div>
                      <div className="flex items-center space-x-2 mt-2">
                        <Checkbox
                          id="setAsDefault"
                          checked={setAsDefault}
                          onCheckedChange={(checked) =>
                            setSetAsDefault(checked as boolean)
                          }
                        />
                        <label
                          htmlFor="setAsDefault"
                          className="text-sm text-gray-600 cursor-pointer"
                        >
                          Set these credentials as default
                        </label>
                      </div>
                    </div>

                    {/* Acceptance Criteria */}
                    <div>
                      <textarea
                        placeholder="Acceptance Criteria"
                        value={acceptanceCriteria}
                        onChange={(e) => {
                          setAcceptanceCriteria(e.target.value);
                          if (acceptanceCriteriaError)
                            setAcceptanceCriteriaError("");
                        }}
                        className={cn(
                          "w-full border border-gray-300 p-3 rounded-md resize-y min-h-[5rem] hidden",
                          acceptanceCriteriaError
                            ? "border-red-500 focus-visible:ring-red-500"
                            : "",
                        )}
                        style={{
                          resize: "vertical",
                        }}
                        onInput={(e) => {
                          // Wrapped Text Box
                          const target = e.target as HTMLTextAreaElement;
                          target.style.height = "auto";
                          target.style.height = `${Math.max(80, target.scrollHeight)}px`;
                        }}
                      />
                      {acceptanceCriteriaError && (
                        <p className="text-red-500 text-sm font-medium mt-1">
                          {acceptanceCriteriaError}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex gap-4">
                  <Button
                    variant="outline"
                    className="flex-1 hover:bg-gray-100 py-6 rounded-md"
                    onClick={() => setStepNum(2)}
                  >
                    Back
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-6 rounded-md"
                    disabled={isLoading}
                  >
                    {isLoading ? "Submitting..." : "Submit"}
                  </Button>
                </div>
              </form>
            </div>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 md:px-6 py-8 md:py-12">
      <div className="w-full max-w-7xl mx-auto">
        <div className="h-[4rem]"></div>
        <div
          className={cn(
            "fixed top-0 right-0 left-0 p-4 flex items-center bg-secondary-background shadow-sm shadow-primary/5 backdrop-blur-md justify-between z-10 transition-all",
          )}
        >
          <aside className={cn("flex items-center gap-2")}>
            <img src="/QAI-logo.svg" height={32} width={32} alt="QAI Logo" />
            <span className="text-xl font-bold">QAI</span>
          </aside>

          {/* Step indicator */}
          <div className="flex items-center gap-2">
            <div className="flex items-center">
              {[1, 2, 3].map((step) => (
                <div key={step} className="flex items-center">
                  <div
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center",
                      step === stepNum
                        ? "bg-purple-600 text-white"
                        : step < stepNum
                          ? "bg-purple-200 text-purple-800"
                          : "bg-gray-200 text-gray-500",
                    )}
                  >
                    {step}
                  </div>
                  {step < 3 && (
                    <div
                      className={cn(
                        "w-8 h-1",
                        step < stepNum ? "bg-purple-200" : "bg-gray-200",
                      )}
                    ></div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Header and Form Content */}
        {isLoading ? (
          <div className="flex items-center justify-center flex-col gap-4 mt-20">
            <Loading />
            <p>Setting up your organization and product space. Almost there!</p>
          </div>
        ) : (
          <div className="flex flex-col items-center mb-16 md:mb-24 relative">
            {renderStep()}
          </div>
        )}
      </div>
    </div>
  );
}
