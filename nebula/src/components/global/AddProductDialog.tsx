"use client";
import { useEffect, useState } from "react";
import type React from "react";

import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AppDispatch } from "@/app/store/store";
import { toast } from "sonner";
import { Plus, ChevronDown } from "lucide-react";
import { useDispatch } from "react-redux";
import { addProduct } from "@/app/store/productSlice";
import { ProductSwitcherSchema } from "@/lib/types";
import { useProductSwitcher } from "@/providers/product-provider";
import { GRAPH_COLLABORATION_SERVER_URL } from "@/lib/constants";
import { useUser } from "@clerk/nextjs";
import { usePathname, useRouter } from "next/navigation";
import { Checkbox } from "@/components/ui/checkbox";
import { cn, ValidationHelpers } from "@/lib/utils";
import * as Sentry from "@sentry/nextjs";
import { addGraphFeature } from "@/app/store/graphFeaturesSlice";

const AddProductDialog = () => {
  const [open, setOpen] = useState(false);
  const [productName, setProductName] = useState("");
  const [nameError, setNameError] = useState("");
  const [platform, setPlatform] = useState("");
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showAdvancedSection, setShowAdvancedSection] = useState(false);
  const dispatch = useDispatch<AppDispatch>();
  const { user } = useUser();
  const router = useRouter();
  const pathname = usePathname();
  const { setProductSwitcher } = useProductSwitcher();
  const [testUsername, setTestUsername] = useState("");
  const [testPassword, setTestPassword] = useState("");
  const [setAsDefault, setSetAsDefault] = useState(false);
  const [usernameError, setUsernameError] = useState("");
  const [acceptanceCriteria, setAcceptanceCriteria] = useState("");
  const [acceptanceCriteriaError, setAcceptanceCriteriaError] = useState("");

  // Reset the form when the dialog closes
  useEffect(() => {
    if (!open) {
      resetForm();
    }
  }, [open]);

  const resetForm = () => {
    setProductName("");
    setPlatform("");
    setUrl("");
    setNameError("");
    setUrlError("");
    setShowAdvancedSection(false);
    setTestUsername("");
    setTestPassword("");
    setSetAsDefault(false);
    setUsernameError("");
    setAcceptanceCriteria("");
    setAcceptanceCriteriaError("");
  };

  // Validation functions
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

  const handleSubmit = async (e: React.FormEvent) => {
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

    setLoading(true);

    const organisationId = user?.publicMetadata?.organisation_id;
    if (!user?.publicMetadata?.organisation_id) {
      toast.error(
        "No organisation id selected, re-routing to create organisation",
      );
      router.push("/onboarding?step=2");
    }

    const addProductPayload: {
      google_play_store_url: string;
      apple_app_store_url: string;
      product_name: string;
      web_url: string;
      organisation_id: string;
      default_credentials?: {
        credentials: Record<string, string>;
        description: string;
        is_default: boolean;
      };
    } = {
      google_play_store_url: "",
      apple_app_store_url: "",
      product_name: "",
      web_url: "",
      organisation_id: organisationId as string,
    };

    addProductPayload[getUrlKey(platform)] = normalizedUrl;
    addProductPayload.product_name = productName;

    // Add credentials if provided
    if (testUsername.trim() || testPassword.trim()) {
      addProductPayload.default_credentials = {
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

    try {
      const response = await fetch("/api/add-product", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(addProductPayload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to add product");
      }

      const data = await response.json();
      const createdProductId = data.product_id || data.product?.product_id;
      dispatch(addProduct(data as ProductSwitcherSchema));
      setProductSwitcher(data);

      if (createdProductId) {
        if (pathname?.includes("/editor")) {
          router.push(`/${createdProductId}/editor`);
        } else if (!pathname?.includes("/editor")) {
          router.push(`/${createdProductId}?showFlows=true`);
        } else {
          router.push(`/${createdProductId}`);
        }
      }

      // Create a default feature for the newly created product
      try {
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
              { level: "warning", tags: { component: "add-product" } },
            );
          }
        }
      } catch (err) {
        Sentry.captureException(err, {
          level: "error",
          tags: { component: "add-product" },
        });
      }
      // Close the dialog automatically after successful product addition
      setOpen(false);
      toast.success("Product Added Successfully");
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "An unexpected error occurred",
      );
      Sentry.captureException(err, {
        level: "fatal",
        tags: { priority: "high" },
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="flex items-center justify-center rounded-md hover:border-gray-700 transition bg-purple-600 text-white h-10 w-10 shrink-0">
          <Plus className="w-5 h-5" />
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Add a Product</DialogTitle>
        <DialogDescription>
          Tell us about the product that you would like to test
        </DialogDescription>

        <form onSubmit={handleSubmit} className="space-y-6 mt-4">
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
              disabled={loading}
            />
            {nameError && (
              <p className="text-red-500 text-sm font-medium">{nameError}</p>
            )}
          </div>

          <div className="space-y-4">
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
                disabled={loading}
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
                    urlError ? "border-red-500 focus-visible:ring-red-500" : "",
                  )}
                  disabled={loading}
                />
              )}
            </div>

            {urlError && (
              <p className="text-red-500 text-sm font-medium">{urlError}</p>
            )}
          </div>

          {/* Advanced Section */}
          <div className="space-y-4">
            <div className="flex items-center">
              <Button
                type="button"
                variant="link"
                className="text-purple-600 hover:text-purple-700 p-0 h-auto flex items-center"
                onClick={() => setShowAdvancedSection(!showAdvancedSection)}
                disabled={loading}
              >
                Advanced
                <div
                  className={`ml-1 transition-transform ${showAdvancedSection ? "rotate-180" : ""}`}
                >
                  <ChevronDown className="h-4 w-4" />
                </div>
              </Button>
            </div>

            {showAdvancedSection && (
              <div className="space-y-4">
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
                        disabled={loading}
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
                      disabled={loading}
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
                      disabled={loading}
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
                      "w-full border border-gray-300 p-3 rounded-md resize-y min-h-[5rem]",
                      acceptanceCriteriaError
                        ? "border-red-500 focus-visible:ring-red-500"
                        : "",
                    )}
                    disabled={loading}
                  />
                  {acceptanceCriteriaError && (
                    <p className="text-red-500 text-sm font-medium mt-1">
                      {acceptanceCriteriaError}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end space-x-2">
            <DialogClose asChild>
              <Button
                type="button"
                variant="outline"
                onClick={resetForm}
                disabled={loading}
              >
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="submit"
              disabled={loading}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              {loading ? "Adding..." : "Add Product"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddProductDialog;
