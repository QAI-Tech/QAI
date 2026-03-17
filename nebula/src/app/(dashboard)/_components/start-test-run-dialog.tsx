"use client";
import { useState, useEffect, useRef } from "react";
import type React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import Loading from "@/components/global/loading";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ADD_TEST_RUN_API_ENDPOINT,
  DEFAULT_PRODUCT_ID,
  GCS_BUCKET_NAME,
} from "@/lib/constants";
import { useProductSwitcher } from "@/providers/product-provider";
import { toast } from "sonner";
import { useDispatch } from "react-redux";
import type { AppDispatch } from "@/app/store/store";
import { addTestRun } from "@/app/store/testRunSlice";
import { useUser } from "@clerk/nextjs";
import { Check, ChevronDown, Smartphone, Upload, X } from "lucide-react";
import { FIREBASE_URL, TESTFLIGHT_URL, isQaiOrgUser } from "@/lib/constants";
import { cn, ValidationHelpers } from "@/lib/utils";
import * as Sentry from "@sentry/nextjs";
import { MONTH_NAMES } from "@/lib/constants";

interface StartTestRunDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showTrigger?: boolean;
  selectedTestCaseIds?: string[];
  existingTestRunId?: string;
  variant?: "v1" | "v2"; // v2 aligns with motion-wire-story styling
  selectedFlowIds?: string[]; // flows-first selection for v2
  testType?: string; // test type for v2 variant
}

export function StartTestRunDialog({
  open: controlledOpen,
  onOpenChange,
  showTrigger = true, // default to true for backward compatibility
  selectedTestCaseIds = [], // default to empty array
  existingTestRunId,
  variant = "v1",
  selectedFlowIds = [],
  testType = "functional", // default to functional
}: StartTestRunDialogProps) {
  const router = useRouter();
  const { productSwitcher } = useProductSwitcher();
  const { user } = useUser();
  const organisationId = user?.publicMetadata?.organisation_id;

  const [internalOpen, setInternalOpen] = useState(false);
  const [isStartTestRunLoading, setIsStartTestRunLoading] = useState(false);
  const dispatch = useDispatch<AppDispatch>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [formData, setFormData] = useState<{
    testRunName: string;
    buildNumber: string;
    platform: string;
    productId: string;
    deviceIds: string[];
    acceptance_criteria: string;
  }>({
    testRunName: "",
    buildNumber: "",
    platform: "",
    productId: productSwitcher.product_id || DEFAULT_PRODUCT_ID,
    deviceIds: [],
    acceptance_criteria: "",
  });

  const [isDeviceDropdownOpen, setIsDeviceDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState(""); // For device search

  // Validation error states
  const [testRunNameError, setTestRunNameError] = useState("");
  const [buildNumberError, setBuildNumberError] = useState("");
  const [webUrlError, setWebUrlError] = useState("");
  const [acceptanceCriteriaError, setAcceptanceCriteriaError] = useState("");
  const [fileRequiredError, setFileRequiredError] = useState("");
  const [deviceRequiredError, setDeviceRequiredError] = useState("");

  // State for web URL
  const [webUrl, setWebUrl] = useState("");

  // State for testing checkbox
  const [sendToNova, setSendToNova] = useState(false);

  const buildTestRunUrl = (testRunId?: string) => {
    const productId = productSwitcher.product_id || DEFAULT_PRODUCT_ID;

    if (variant === "v2") {
      const base = `/${productId}/test-runs`;
      if (!testRunId) return base;
      const params = new URLSearchParams({ testRunId });
      return `${base}?${params.toString()}`;
    }

    if (!testRunId) return `/${productId}/test-runs`;
    return `/${productId}/test-runs/${testRunId}`;
  };

  // Use controlled open state if provided, otherwise use internal state
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const handleOpenChange = (open: boolean) => {
    if (onOpenChange) {
      onOpenChange(open);
    } else {
      setInternalOpen(open);
    }
  };

  // Validation functions
  const validateTestRunName = (value: string) => {
    if (!value.trim()) {
      return "Test run name is required";
    }
    if (!ValidationHelpers.isValidGeneralName(value)) {
      return "Test Run Name must not exceed 1000 characters";
    }
    return "";
  };

  const validateBuildNumber = (value: string) => {
    if (!value.trim()) {
      return "Build number is required";
    }
    if (!ValidationHelpers.isValidGeneralName(value)) {
      return "Build number should not exceed 1000 characters";
    }
    return "";
  };

  const validateWebUrl = (value: string) => {
    if (!value.trim()) {
      return "Website URL is required";
    }
    if (!ValidationHelpers.isValidWebUrl(value)) {
      return "Please enter a valid web URL";
    }
    return "";
  };

  const validateAcceptanceCriteria = (value: string) => {
    if (value.trim() && !ValidationHelpers.isValidOptionalText(value)) {
      return "Acceptance criteria must have at least 1 character";
    }
    return "";
  };

  // Function to get device options based on platform
  const getDeviceOptions = () => {
    const platform = getPlatformType();

    if (platform === "ANDROID") {
      return [
        { id: "samsung_s24", name: "Samsung S24 (Android 15)" },
        { id: "samsung_a35", name: "Samsung A35 (Android 14)" },
      ];
    } else if (platform === "IOS") {
      return [
        { id: "iphone_15", name: "iPhone 15 (iOS 18.4.1)" },
        { id: "iphone_se", name: "iPhone SE (iOS 18)" },
      ];
    }
    return [];
  };

  // Here the productId is updated in formData when productSwitcher changes
  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      productId: productSwitcher.product_id,
    }));
  }, [productSwitcher.product_id]);

  useEffect(() => {
    if (!isOpen) {
      setFormData({
        testRunName: "",
        buildNumber: "",
        platform: "",
        productId: productSwitcher.product_id || DEFAULT_PRODUCT_ID,
        deviceIds: [],
        acceptance_criteria: "",
      });
      setSelectedFile(null);
      setWebUrl("");
      setSearchQuery("");
      setSendToNova(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      // Clear all validation errors
      setTestRunNameError("");
      setBuildNumberError("");
      setWebUrlError("");
      setAcceptanceCriteriaError("");
      setFileRequiredError("");
      setDeviceRequiredError("");
    }
  }, [isOpen, productSwitcher.product_id]);

  // Generate default test run name: DD Mon YYYY
  const generateDefaultTestRunName = () => {
    const now = new Date();
    const day = now.getDate().toString();
    const month = MONTH_NAMES[now.getMonth()];
    const year = now.getFullYear();
    return `${day} ${month} ${year}`;
  };

  // Prefill a friendly default name when opening (v2 experience)
  useEffect(() => {
    if (isOpen && variant === "v2" && !formData.testRunName.trim()) {
      setFormData((prev) => ({
        ...prev,
        testRunName: generateDefaultTestRunName(),
      }));
    }
  }, [
    isOpen,
    variant,
    productSwitcher.product_name,
    productSwitcher.web_url,
    productSwitcher.apple_app_store_url,
  ]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsDeviceDropdownOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    // Clear validation errors when user starts typing
    if (name === "testRunName") {
      if (testRunNameError) setTestRunNameError("");
    }
    if (name === "buildNumber") {
      if (buildNumberError) setBuildNumberError("");
    }
    if (name === "acceptance_criteria") {
      if (acceptanceCriteriaError) setAcceptanceCriteriaError("");
    }
  };

  const handleDeviceToggle = (deviceId: string) => {
    setFormData((prev) => {
      const newDeviceIds = prev.deviceIds.includes(deviceId)
        ? prev.deviceIds.filter((id) => id !== deviceId)
        : [...prev.deviceIds, deviceId];

      // Clear error if at least one device is selected
      if (newDeviceIds.length > 0) {
        setDeviceRequiredError("");
      }

      return {
        ...prev,
        deviceIds: newDeviceIds,
      };
    });
  };

  const handleRemoveDevice = (deviceId: string, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent dropdown from opening
    setFormData((prev) => ({
      ...prev,
      deviceIds: prev.deviceIds.filter((id) => id !== deviceId),
    }));
  };

  const handleWebUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setWebUrl(e.target.value);
    if (webUrlError) setWebUrlError("");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      if (fileRequiredError) setFileRequiredError("");
    }
  };

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  // Primary selection source (flows for v2, test cases otherwise)
  const primarySelectionIds =
    variant === "v2" ? selectedFlowIds : selectedTestCaseIds;
  const isTriggerDisabled =
    variant === "v2" && primarySelectionIds.length === 0;

  // Determine platform type from ProductSwitcher
  const getPlatformType = () => {
    if (productSwitcher.web_url) {
      return "WEB";
    } else if (productSwitcher.apple_app_store_url) {
      return "IOS";
    } else {
      return "ANDROID";
    }
  };

  const validateForm = (requireBuild = true) => {
    const platform = getPlatformType();
    const isWebPlatform = platform === "WEB";
    const isTestFlightOrFirebase = platform === "IOS" || platform === "ANDROID";

    let hasErrors = false;

    if (variant === "v2" && primarySelectionIds.length === 0) {
      toast.error("Select at least one flow to start a test run");
      hasErrors = true;
    }

    // Validate test run name
    const testRunNameValidation = validateTestRunName(formData.testRunName);
    setTestRunNameError(testRunNameValidation);
    if (testRunNameValidation) hasErrors = true;

    const buildNumberValidation = validateBuildNumber(formData.buildNumber);
    setBuildNumberError(buildNumberValidation);
    if (buildNumberValidation) hasErrors = true;

    // Validate acceptance criteria (optional field)
    const acceptanceCriteriaValidation = validateAcceptanceCriteria(
      formData.acceptance_criteria,
    );
    setAcceptanceCriteriaError(acceptanceCriteriaValidation);
    if (acceptanceCriteriaValidation) hasErrors = true;

    // Validate web URL for web platform
    if (isWebPlatform && requireBuild) {
      const webUrlValidation = validateWebUrl(webUrl);
      setWebUrlError(webUrlValidation);
      if (webUrlValidation) hasErrors = true;
    }

    // Validate file requirement for mobile platforms
    if (
      !isWebPlatform &&
      requireBuild &&
      !selectedFile &&
      !isTestFlightOrFirebase
    ) {
      setFileRequiredError("File selection is required");
      hasErrors = true;
    } else {
      setFileRequiredError("");
    }

    // Validate device selection for mobile platforms
    if (!isWebPlatform && formData.deviceIds.length === 0) {
      setDeviceRequiredError("At least one device must be selected");
      hasErrors = true;
    } else {
      setDeviceRequiredError("");
    }

    return !hasErrors;
  };

  const handleStartTestRun = async () => {
    try {
      if (!validateForm()) return;

      setIsStartTestRunLoading(true);

      const platform = getPlatformType();

      if (existingTestRunId) {
        try {
          const response = await fetch("/api/add-new-test-cases-to-test-run", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              test_run_id: existingTestRunId,
              test_case_ids: selectedTestCaseIds.map((id) => String(id)),
              send_to_nova: sendToNova,
            }),
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(
              errorData.error ||
                "Failed to add test cases to existing test run",
            );
          }

          toast.success("Test cases added successfully");
          handleOpenChange(false);
          router.push(buildTestRunUrl(existingTestRunId));
          return;
        } catch (error) {
          console.error("Error adding test cases:", error);
          Sentry.captureException(error, {
            level: "fatal",
            tags: { priority: "high" },
          });
          toast.error(
            error instanceof Error ? error.message : "Failed to add test cases",
          );
          setIsStartTestRunLoading(false);
          return;
        }
      }

      // For new test runs, proceed with the existing logic
      const addTestRunData = {
        testRunName: formData.testRunName,
        buildNumber: formData.buildNumber,
        platform: platform,
        productId: formData.productId || DEFAULT_PRODUCT_ID,
        executable_url:
          platform === "WEB"
            ? webUrl
            : platform === "IOS"
              ? TESTFLIGHT_URL
              : FIREBASE_URL,
        deviceIds: platform !== "WEB" ? formData.deviceIds.join(",") : "",
        // Use flow_ids for v2 variant, test_case_ids for v1
        ...(variant === "v2"
          ? { flow_ids: selectedFlowIds, test_run_type: testType }
          : { test_case_ids: selectedTestCaseIds }),
        acceptance_criteria: formData.acceptance_criteria,
        send_to_nova: sendToNova,
      };

      // Only upload file for non-web platforms
      if (platform !== "WEB" && selectedFile && organisationId) {
        try {
          const product_id = formData.productId;
          const uploadPath = `${organisationId}/${product_id}/builds/${crypto.randomUUID()}_${selectedFile.name}`;

          console.log("Uploading file with path:", uploadPath);

          // Signed URL for the upload
          const signedUrlResponse = await fetch(
            `/api/generate-instructions?getSignedUrl=true&bucketName=${GCS_BUCKET_NAME}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                fileName: uploadPath,
                contentType: selectedFile.type,
              }),
            },
          );

          if (!signedUrlResponse.ok) {
            throw new Error("Failed to get signed URL for file upload");
          }

          const { signedUrl, fileName: uploadedFileName } =
            await signedUrlResponse.json();
          const fileName = uploadedFileName.replace("gs://", "");

          console.log("File Name:", fileName);

          // Uploading the file to GCS
          const uploadResponse = await fetch(signedUrl, {
            method: "PUT",
            body: selectedFile,
            headers: {
              "Content-Type": selectedFile.type,
            },
            mode: "cors",
          });

          if (!uploadResponse.ok) {
            throw new Error(`Failed to upload file: ${uploadResponse.status}`);
          }

          // Getting an authenticated URL for accessing the file
          const viewSignedUrlResponse = await fetch(
            `/api/generate-signed-url-for-frame?framePath=${fileName}`,
            {
              method: "GET",
            },
          );

          if (!viewSignedUrlResponse.ok) {
            throw new Error("Failed to get authenticated URL for file");
          }

          const { signedUrl: authUrl } = await viewSignedUrlResponse.json();

          // Update the executable_url
          addTestRunData.executable_url = authUrl;

          console.log("Executable URL:", authUrl);
          toast.success("File uploaded successfully");
        } catch (error) {
          console.error("Error uploading file:", error);
          Sentry.captureException(error, {
            level: "fatal",
            tags: { priority: "high" },
          });
          toast.error("Failed to upload file");
          setIsStartTestRunLoading(false);
          return;
        }
      }

      console.log("Submitting test run data:", { addTestRunData });

      // Use the new API endpoint for v2 variant (flows-first), otherwise use the existing endpoint
      const apiEndpoint =
        variant === "v2"
          ? "/api/add-test-run-from-flows"
          : ADD_TEST_RUN_API_ENDPOINT;

      const response = await fetch(apiEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ addTestRunData }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("API Error Response:", errorText);
        throw new Error(`Failed to add test run: ${response.status}`);
      }

      const responseData = await response.json();
      console.log("Received response:", responseData);

      const testRunsArray = responseData.test_runs || [];

      if (!testRunsArray.length) {
        throw new Error("Invalid test run response: no test runs created");
      }

      dispatch(addTestRun(testRunsArray));
      handleOpenChange(false);
      toast.success("Test Run Added Successfully");

      if (testRunsArray.length === 1) {
        router.push(buildTestRunUrl(testRunsArray[0].test_run_id));
      } else {
        router.push(buildTestRunUrl());
      }
    } catch (error) {
      toast.error("Error while adding a Test Run");
      Sentry.captureException(error, {
        level: "fatal",
        tags: { priority: "high" },
      });
      console.error("Error while adding a test run:", error);
    } finally {
      setIsStartTestRunLoading(false);
    }
  };

  const handleTestLiveApp = () => {
    // Only validate test run name and build number for Live App testing
    if (!validateForm(false)) {
      return;
    }

    setIsStartTestRunLoading(true);

    // Create test run data without a file
    const addTestRunData = {
      testRunName: formData.testRunName,
      buildNumber: formData.buildNumber,
      platform: getPlatformType(),
      productId: formData.productId || DEFAULT_PRODUCT_ID,
      executable_url: "", // No file is being uploaded
      deviceIds:
        getPlatformType() !== "WEB" ? formData.deviceIds.join(",") : "",
      // Use flow_ids for v2 variant, test_case_ids for v1
      ...(variant === "v2"
        ? { flow_ids: selectedFlowIds, test_run_type: testType }
        : { test_case_ids: selectedTestCaseIds }),
      acceptance_criteria: formData.acceptance_criteria,
      send_to_nova: sendToNova,
    };

    // Use the new API endpoint for v2 variant (flows-first), otherwise use the existing endpoint
    const apiEndpoint =
      variant === "v2"
        ? "/api/add-test-run-from-flows"
        : ADD_TEST_RUN_API_ENDPOINT;

    // Call the API to add a test run
    fetch(apiEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ addTestRunData }),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to add test run: ${response.status}`);
        }
        return response.json();
      })
      .then((responseData) => {
        console.log("Received response:", responseData);

        const testRunsArray = responseData.test_runs || [];

        if (!testRunsArray.length) {
          throw new Error("Invalid test run response: no test runs created");
        }

        dispatch(addTestRun(testRunsArray));
        handleOpenChange(false);
        toast.success("Test Run Started Successfully");

        if (testRunsArray.length === 1) {
          router.push(buildTestRunUrl(testRunsArray[0].test_run_id));
        } else {
          router.push(buildTestRunUrl());
        }
      })
      .catch((error) => {
        toast.error("Error while adding a Test Run");
        Sentry.captureException(error, {
          level: "fatal",
          tags: { priority: "high" },
        });
        console.error("Error while adding a test run:", error);
      })
      .finally(() => {
        setIsStartTestRunLoading(false);
      });
  };

  const handleCombinedTestRun = () => {
    const platform = getPlatformType();
    const hasBuildDetails =
      (platform === "WEB" && webUrl.trim() !== "") ||
      (platform !== "WEB" && selectedFile !== null);

    // If build details (URL or file) are provided, use the full test run flow
    // Otherwise, use the live app flow
    if (hasBuildDetails) {
      handleStartTestRun();
    } else {
      handleTestLiveApp();
    }
  };

  // Filter device options based on search query
  const filteredDeviceOptions = getDeviceOptions().filter((device) =>
    device.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // Get device name by ID
  const getDeviceName = (deviceId: string) => {
    const device = getDeviceOptions().find((d) => d.id === deviceId);
    return device ? device.name : deviceId;
  };

  const v1Content = (
    <DialogContent className="sm:max-w-[425px]">
      <DialogHeader>
        <DialogTitle>Start a New Test Run</DialogTitle>
      </DialogHeader>
      <div className="grid gap-4 py-2">
        <div className="space-y-1">
          <Label htmlFor="testRunName" className="text-sm font-medium">
            Test Run Name*
          </Label>
          <Input
            id="testRunName"
            onChange={handleChange}
            name="testRunName"
            value={formData.testRunName}
            className={cn(
              testRunNameError
                ? "border-red-500 focus-visible:ring-red-500"
                : "border-gray-200",
            )}
            placeholder="Enter test run name"
            disabled={isStartTestRunLoading}
          />
          {testRunNameError && (
            <p className="text-red-500 text-sm font-medium">
              {testRunNameError}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <Label htmlFor="buildNumber" className="text-sm font-medium">
            Build Number*
          </Label>
          <Input
            id="buildNumber"
            onChange={handleChange}
            name="buildNumber"
            value={formData.buildNumber}
            className={cn(
              buildNumberError
                ? "border-red-500 focus-visible:ring-red-500"
                : "border-gray-200",
            )}
            placeholder="Enter build number (e.g., 1.2.10)"
            disabled={isStartTestRunLoading}
          />
          {buildNumberError && (
            <p className="text-red-500 text-sm font-medium">
              {buildNumberError}
            </p>
          )}
        </div>

        {/* Device Selection Dropdown - will only be shown for Android and iOS */}
        {getPlatformType() !== "WEB" && (
          <div className="space-y-1">
            <Label className="text-sm font-medium">Select Device(s)*</Label>

            <div
              className={`relative ${deviceRequiredError ? "has-error" : ""}`}
              ref={dropdownRef}
            >
              {/* Selected devices display with dropdown arrow */}
              <div className="relative">
                <div
                  className={cn(
                    "flex flex-wrap gap-1 min-h-[38px] p-2 border rounded-md cursor-pointer pr-10",
                    deviceRequiredError ? "border-red-500" : "border-gray-200",
                    formData.deviceIds.length > 0 ? "pb-1" : "",
                  )}
                  onClick={() =>
                    !isStartTestRunLoading &&
                    setIsDeviceDropdownOpen(!isDeviceDropdownOpen)
                  }
                >
                  {formData.deviceIds.length === 0 ? (
                    <span className="text-gray-500 text-sm py-0.5">
                      Select device(s)
                    </span>
                  ) : (
                    <>
                      {formData.deviceIds.map((deviceId) => (
                        <div
                          key={deviceId}
                          className="bg-purple-100 text-purple-800 text-xs rounded-full py-1 px-3 flex items-center gap-1"
                        >
                          <Smartphone className="h-3 w-3" />
                          <span>{getDeviceName(deviceId).split(" (")[0]}</span>
                          <X
                            className="h-3 w-3 cursor-pointer hover:text-purple-950"
                            onClick={(e) => handleRemoveDevice(deviceId, e)}
                          />
                        </div>
                      ))}
                    </>
                  )}
                </div>
                {/* Down arrow button */}
                <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                  <ChevronDown className="h-5 w-5 text-gray-400" />
                </div>
              </div>

              {/* Dropdown menu */}
              {isDeviceDropdownOpen && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg">
                  {/* Search input */}
                  <div className="p-2 border-b">
                    <Input
                      type="text"
                      placeholder="Search devices..."
                      className="w-full text-sm border-gray-200"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>

                  {/* Device list */}
                  <div className="max-h-60 overflow-y-auto py-1">
                    {filteredDeviceOptions.length > 0 ? (
                      filteredDeviceOptions.map((device) => (
                        <div
                          key={device.id}
                          className="flex items-center px-3 py-2 hover:bg-purple-50 cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeviceToggle(device.id);
                          }}
                        >
                          <div
                            className={`w-5 h-5 rounded border flex-none flex items-center justify-center mr-2 ${
                              formData.deviceIds.includes(device.id)
                                ? "bg-purple-600 border-purple-600"
                                : "border-gray-300"
                            }`}
                          >
                            {formData.deviceIds.includes(device.id) && (
                              <Check className="h-3 w-3 text-white" />
                            )}
                          </div>
                          <div className="flex-1 flex flex-col">
                            <span className="text-sm font-medium">
                              {device.name.split(" (")[0]}
                            </span>
                            <span className="text-xs text-gray-500">
                              {device.name.includes("(")
                                ? device.name.split("(")[1].replace(")", "")
                                : ""}
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="px-3 py-2 text-sm text-gray-500">
                        No devices match your search
                      </div>
                    )}
                  </div>

                  {/* Done button */}
                  <div className="p-2 border-t flex justify-between">
                    <span className="text-xs text-gray-500 flex items-center">
                      {formData.deviceIds.length} device(s) selected
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      className="bg-purple-600 hover:bg-purple-700 h-8 px-3"
                      onClick={() => setIsDeviceDropdownOpen(false)}
                    >
                      Done
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {deviceRequiredError && (
              <p className="text-red-500 text-sm font-medium">
                {deviceRequiredError}
              </p>
            )}
          </div>
        )}
        {getPlatformType() !== "WEB" && (
          <div className="space-y-1 hidden">
            <Label className="text-sm font-medium">Acceptance Criteria</Label>
            <textarea
              name="acceptance_criteria"
              value={formData.acceptance_criteria}
              onChange={handleChange}
              className={cn(
                "w-full min-h-[80px] p-2 border rounded-md resize-y",
                acceptanceCriteriaError
                  ? "border-red-500 focus-visible:ring-red-500"
                  : "border-gray-200",
              )}
              placeholder="Enter additional acceptance criteria (optional)"
            />
            {acceptanceCriteriaError && (
              <p className="text-red-500 text-sm font-medium">
                {acceptanceCriteriaError}
              </p>
            )}
          </div>
        )}

        {/* Platform-specific Build to test field */}
        <div className={`space-y-1`}>
          <Label className="text-sm font-medium">
            {getPlatformType() === "ANDROID" && "Build to test (APK):"}
            {getPlatformType() === "IOS" && "Build to test (IPA):"}
            {getPlatformType() === "WEB" && "Build to test (URL):"}
          </Label>

          {/* Web platform */}
          {getPlatformType() === "WEB" && (
            <>
              <Input
                type="url"
                value={webUrl}
                onChange={handleWebUrlChange}
                placeholder="Enter website URL"
                className={cn(
                  webUrlError
                    ? "border-red-500 focus-visible:ring-red-500"
                    : "border-gray-200",
                )}
                disabled={isStartTestRunLoading}
              />
              <p className="text-xs text-gray-500 mt-1">
                Enter a URL to test a specific build, or leave empty to test
                your live app.
              </p>
              {webUrlError && (
                <p className="text-red-500 text-sm font-medium">
                  {webUrlError}
                </p>
              )}
            </>
          )}

          {/* iOS platform */}
          {getPlatformType() === "IOS" && (
            <>
              <div className="flex-1 border rounded-md overflow-hidden">
                <Input
                  readOnly
                  value={selectedFile ? selectedFile.name : "Choose IPA"}
                  className={cn(
                    "cursor-pointer",
                    fileRequiredError ? "border-red-500" : "",
                  )}
                  onClick={handleFileSelect}
                  disabled={isStartTestRunLoading}
                />
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="hidden"
                  accept=".ipa"
                  disabled={isStartTestRunLoading}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Select a file to test a specific build, or leave empty to test
                your live app.
              </p>
              {fileRequiredError && (
                <p className="text-red-500 text-sm font-medium">
                  {fileRequiredError}
                </p>
              )}
            </>
          )}

          {/* Android platform */}
          {getPlatformType() === "ANDROID" && (
            <>
              <div className="flex-1 border rounded-md overflow-hidden">
                <Input
                  readOnly
                  value={selectedFile ? selectedFile.name : "Choose APK"}
                  className={cn(
                    "cursor-pointer",
                    fileRequiredError ? "border-red-500" : "",
                  )}
                  onClick={handleFileSelect}
                  disabled={isStartTestRunLoading}
                />
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="hidden"
                  accept=".apk"
                  disabled={isStartTestRunLoading}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Select a file to test a specific build, or leave empty to test
                your live app.
              </p>
              {fileRequiredError && (
                <p className="text-red-500 text-sm font-medium">
                  {fileRequiredError}
                </p>
              )}
            </>
          )}
        </div>

        {/* Send to Nova checkbox */}
        {isQaiOrgUser(organisationId as string) && (
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="sendToNova"
              checked={sendToNova}
              onChange={(e) => setSendToNova(e.target.checked)}
              className="h-4 w-4 text-purple-600 focus:ring-purple-500"
            />
            <label
              htmlFor="sendToNova"
              className="text-sm text-muted-foreground"
            >
              Send to Nova
            </label>
          </div>
        )}

        {/* Start Test Run button*/}
        <Button
          type="button"
          className="w-full bg-purple-600 hover:bg-purple-700"
          onClick={handleCombinedTestRun}
          disabled={
            isStartTestRunLoading ||
            !formData.testRunName.trim() ||
            !formData.buildNumber.trim() ||
            (getPlatformType() !== "WEB" && formData.deviceIds.length === 0)
          }
        >
          {isStartTestRunLoading ? (
            <div className="flex items-center justify-center py-2">
              <Loading />
            </div>
          ) : (
            "Start Test Run"
          )}
        </Button>
      </div>
    </DialogContent>
  );

  const v2Content = (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle className="text-2xl font-semibold">
          Start Test Run
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-5 pt-2">
        <div className="space-y-2">
          <Label className="text-sm text-muted-foreground">
            Test Run Name*
          </Label>
          <Input
            placeholder="Test Run Name"
            value={formData.testRunName}
            onChange={handleChange}
            name="testRunName"
            className={cn(
              "h-12",
              testRunNameError
                ? "border-red-500 focus-visible:ring-red-500"
                : "border-gray-200",
            )}
            disabled={isStartTestRunLoading}
          />
        </div>

        <div className="space-y-2">
          <Input
            placeholder="Build number*"
            value={formData.buildNumber}
            onChange={handleChange}
            name="buildNumber"
            className={cn(
              "h-12",
              buildNumberError
                ? "border-red-500 focus-visible:ring-red-500"
                : "border-gray-200",
            )}
            disabled={isStartTestRunLoading}
          />
          {buildNumberError && (
            <p className="text-red-500 text-sm font-medium">
              {buildNumberError}
            </p>
          )}
        </div>

        {getPlatformType() !== "WEB" && (
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">
              Select devices*:
            </Label>

            <div
              className={`relative ${deviceRequiredError ? "has-error" : ""}`}
              ref={dropdownRef}
            >
              <div className="relative">
                <div
                  className={cn(
                    "flex flex-wrap items-center gap-1 min-h-[48px] p-2 border rounded-md cursor-pointer pr-10",
                    deviceRequiredError ? "border-red-500" : "border-gray-200",
                  )}
                  onClick={() =>
                    !isStartTestRunLoading &&
                    setIsDeviceDropdownOpen(!isDeviceDropdownOpen)
                  }
                >
                  {formData.deviceIds.length === 0 ? (
                    <span className="text-gray-500 text-sm">
                      Select device(s)
                    </span>
                  ) : (
                    <>
                      {formData.deviceIds.map((deviceId) => (
                        <div
                          key={deviceId}
                          className="bg-purple-100 text-purple-800 text-xs rounded-full py-1 px-3 flex items-center gap-1"
                        >
                          <Smartphone className="h-3 w-3" />
                          <span>{getDeviceName(deviceId).split(" (")[0]}</span>
                          <X
                            className="h-3 w-3 cursor-pointer hover:text-purple-950"
                            onClick={(e) => handleRemoveDevice(deviceId, e)}
                          />
                        </div>
                      ))}
                    </>
                  )}
                </div>
                <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                  <ChevronDown className="h-5 w-5 text-gray-400" />
                </div>
              </div>

              {isDeviceDropdownOpen && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg">
                  <div className="p-2 border-b">
                    <Input
                      type="text"
                      placeholder="Search devices..."
                      className="w-full text-sm border-gray-200"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>

                  <div className="max-h-60 overflow-y-auto py-1">
                    {filteredDeviceOptions.length > 0 ? (
                      filteredDeviceOptions.map((device) => (
                        <div
                          key={device.id}
                          className="flex items-center px-3 py-2 hover:bg-purple-50 cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeviceToggle(device.id);
                          }}
                        >
                          <div
                            className={`w-5 h-5 rounded border flex-none flex items-center justify-center mr-2 ${
                              formData.deviceIds.includes(device.id)
                                ? "bg-purple-600 border-purple-600"
                                : "border-gray-300"
                            }`}
                          >
                            {formData.deviceIds.includes(device.id) && (
                              <Check className="h-3 w-3 text-white" />
                            )}
                          </div>
                          <div className="flex-1 flex flex-col">
                            <span className="text-sm font-medium">
                              {device.name.split(" (")[0]}
                            </span>
                            <span className="text-xs text-gray-500">
                              {device.name.includes("(")
                                ? device.name.split("(")[1].replace(")", "")
                                : ""}
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="px-3 py-2 text-sm text-gray-500">
                        No devices match your search
                      </div>
                    )}
                  </div>

                  <div className="p-2 border-t flex justify-between">
                    <span className="text-xs text-gray-500 flex items-center">
                      {formData.deviceIds.length} device(s) selected
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      className="bg-purple-600 hover:bg-purple-700 h-8 px-3"
                      onClick={() => setIsDeviceDropdownOpen(false)}
                    >
                      Done
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {deviceRequiredError && (
              <p className="text-red-500 text-sm font-medium">
                {deviceRequiredError}
              </p>
            )}
          </div>
        )}

        <div className="space-y-2">
          <Label className="text-sm text-muted-foreground">
            {getPlatformType() === "ANDROID" && "Build to test (APK):"}
            {getPlatformType() === "IOS" && "Build to test (IPA):"}
            {getPlatformType() === "WEB" && "Build to test (URL):"}
          </Label>

          {getPlatformType() === "WEB" ? (
            <>
              <Input
                type="url"
                value={webUrl || productSwitcher.web_url}
                onChange={handleWebUrlChange}
                placeholder="Enter website URL"
                className={cn(
                  "h-12",
                  webUrlError
                    ? "border-red-500 focus-visible:ring-red-500"
                    : "border-gray-200",
                )}
                disabled={isStartTestRunLoading}
              />
              <p className="text-xs text-gray-500">
                Enter a URL to test a specific build
              </p>
              {webUrlError && (
                <p className="text-red-500 text-sm font-medium">
                  {webUrlError}
                </p>
              )}
            </>
          ) : (
            <div className="flex gap-3">
              <Input
                readOnly
                value={
                  selectedFile
                    ? selectedFile.name
                    : getPlatformType() === "IOS"
                      ? "Choose IPA"
                      : "Choose APK"
                }
                className={cn(
                  "h-12 flex-1 cursor-pointer",
                  fileRequiredError ? "border-red-500" : "border-gray-200",
                )}
                onClick={handleFileSelect}
                disabled={isStartTestRunLoading}
              />
              <Button
                variant="outline"
                className="h-12 border-purple-600 text-purple-600 hover:bg-purple-50 hover:border-purple-700 hover:text-purple-700"
                onClick={handleFileSelect}
                disabled={isStartTestRunLoading}
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload
              </Button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
                accept={getPlatformType() === "IOS" ? ".ipa" : ".apk"}
                disabled={isStartTestRunLoading}
              />
            </div>
          )}

          {fileRequiredError && (
            <p className="text-red-500 text-sm font-medium">
              {fileRequiredError}
            </p>
          )}
        </div>

        {isQaiOrgUser(organisationId as string) && (
          <div className="flex items-center space-x-2 hidden">
            <input
              type="checkbox"
              id="sendToNova"
              checked={sendToNova}
              onChange={(e) => setSendToNova(e.target.checked)}
              className="h-4 w-4 text-purple-600 focus:ring-purple-500"
            />
            <label
              htmlFor="sendToNova"
              className="text-sm text-muted-foreground"
            >
              Send to Nova
            </label>
          </div>
        )}

        <Button
          onClick={handleCombinedTestRun}
          className="w-full h-12 text-base"
          disabled={
            isStartTestRunLoading ||
            !formData.testRunName.trim() ||
            !formData.buildNumber.trim() ||
            (getPlatformType() !== "WEB" && formData.deviceIds.length === 0)
          }
        >
          {isStartTestRunLoading ? (
            <div className="flex items-center justify-center py-2">
              <Loading />
            </div>
          ) : (
            `Start Test Run with ${primarySelectionIds.length} ${variant === "v2" ? "flow" : "test case"}${primarySelectionIds.length !== 1 ? "s" : ""}`
          )}
        </Button>
      </div>
    </DialogContent>
  );

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      {!controlledOpen && showTrigger && (
        <DialogTrigger asChild>
          <Button
            className="bg-purple-600 hover:bg-purple-700"
            onClick={() => handleOpenChange(true)}
            disabled={isTriggerDisabled}
          >
            Start a New Test Run
          </Button>
        </DialogTrigger>
      )}
      {variant === "v2" ? v2Content : v1Content}
    </Dialog>
  );
}
