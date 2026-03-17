"use client";
import { useProductSwitcher } from "@/providers/product-provider";
import type React from "react";

import ProductLoadingScreen from "@/components/global/ProductLoadingScreen";
import { useParams } from "next/navigation";
import { SERVER_IP_MAP, GCS_BUCKET_URL } from "@/lib/constants";
import { useEffect, useState } from "react";
import { TCHeader } from "@/app/(dashboard)/[product]/homev1/test-cases/components/tc-header";
import { TCFrame } from "@/app/(dashboard)/[product]/homev1/test-cases/components/tc-frame";
import { TCDetailsSection } from "@/app/(dashboard)/[product]/homev1/test-cases/components/tc-details-section";
import TestCaseFlowViewer from "@/components/global/show-flow-viewer";
import { TestCaseDetailsViewerModal } from "@/app/(dashboard)/[product]/homev1/test-cases/details/test-case-details-viewer-modal";
import { useSelector, useDispatch } from "react-redux";
import type { RootState, AppDispatch } from "@/app/store/store";
import { type testCaseSchema, TestCaseStatus, Criticality } from "@/lib/types";
import { toast } from "sonner";
import * as Sentry from "@sentry/nextjs";
import { updateTestCase } from "@/app/store/testCaseSlice";
import { ADD_TEST_RUN_API_ENDPOINT } from "@/lib/constants";

type LoadingState = {
  status: boolean;
  action?: string | null;
};

function ShowTcDetail({
  testCase,
  onClose,
  ip,
}: {
  testCase: testCaseSchema;
  onClose: () => void;
  ip: string;
}) {
  const dispatch = useDispatch<AppDispatch>();
  const features = useSelector((state: RootState) => state.features.features);
  const { productSwitcher } = useProductSwitcher();
  const [testRunId, setTestRunId] = useState<string | null>(null);
  const [showFlowViewer, setshowFlowViewer] = useState(false);
  const [filteredTestCase, setFilteredTestCase] =
    useState<testCaseSchema | null>(testCase);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState<LoadingState>({
    status: false,
    action: null,
  });
  const [isTestRunLoading, setIsTestRunLoading] = useState(false);
  const [criticality, setCriticality] = useState<Criticality | "">("");
  console.log(criticality);

  const useInlineViewer = true;

  const cleanTestCase = (testCase: testCaseSchema) => {
    return {
      ...testCase,
      test_case_steps: testCase.test_case_steps,
      comments: testCase.comments || null,
      preconditions: testCase.preconditions || [],
      credentials: testCase.credentials || [],
      scenarios: testCase.scenarios || [],
      mirrored_test_cases: testCase.mirrored_test_cases || [],
    };
  };

  const handleUpdateTestCase = async (testCaseToUpdate?: testCaseSchema) => {
    try {
      setIsLoading({ status: true, action: "saving" });
      const testCaseData =
        testCaseToUpdate || (filteredTestCase as testCaseSchema);

      const cleanedTestCase = cleanTestCase(testCaseData);

      // Handle comments
      if (testCaseToUpdate?.comments) {
        if (typeof testCaseToUpdate.comments === "string") {
          try {
            JSON.parse(testCaseToUpdate.comments);
            cleanedTestCase.comments = testCaseToUpdate.comments;
          } catch {
            cleanedTestCase.comments = JSON.stringify([
              testCaseToUpdate.comments,
            ]);
          }
        } else {
          cleanedTestCase.comments = JSON.stringify(testCaseToUpdate.comments);
        }
      } else {
        cleanedTestCase.comments = null;
      }

      const response = await fetch("/api/update-test-case", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testCase: cleanedTestCase }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          `Failed to save test case: ${errorData.error || response.statusText}`,
        );
      }

      // Update Redux
      dispatch(
        updateTestCase({
          id: cleanedTestCase?.test_case_id as string,
          updatedData: cleanedTestCase as testCaseSchema,
        }),
      );

      if (!testCaseToUpdate) {
        toast.success("Test case updated successfully");
      }

      return true;
    } catch (error) {
      console.error("Error saving test case:", error);
      Sentry.captureException(error, {
        level: "error",
        tags: { priority: "high" },
      });
      toast.error("Failed to update test case");
      return false;
    } finally {
      setIsLoading({ status: false, action: null });
    }
  };

  const handleStatusChange = async (newStatus: TestCaseStatus) => {
    if (!filteredTestCase?.test_case_id || isLoading.status) return;

    const updatedTestCase = {
      ...filteredTestCase,
      status: newStatus,
    } as testCaseSchema;
    setFilteredTestCase(updatedTestCase);
    const success = await handleUpdateTestCase(updatedTestCase);

    if (success) {
      toast.success(`Test case status updated to ${newStatus}`);
    }
  };

  const handleCriticalityChange = async (value: Criticality) => {
    if (!filteredTestCase?.test_case_id || isLoading.status) return;
    setCriticality(value);

    const updatedTestCase = {
      ...filteredTestCase,
      criticality: value,
    } as testCaseSchema;
    setFilteredTestCase(updatedTestCase);
    await handleUpdateTestCase(updatedTestCase);
  };

  const handleImageUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    try {
      setIsUploading(true);
      const images = Array.from(files);
      const image = images[0];

      const extension = image.type.split("/")[1];
      const product_id = filteredTestCase?.product_id;

      if (!product_id) {
        toast.error("No product selected");
        return;
      }

      const uploadPath = `${"organisationId"}/${product_id}/${filteredTestCase?.feature_id}/${filteredTestCase?.test_case_id}_frame.${extension}`;

      const signedUrlResponse = await fetch(
        `/api/generate-instructions?getSignedUrl=true&bucketName=${"PRODUCT_DESIGN_ASSETS_BUCKET_NAME"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: uploadPath,
            contentType: image.type,
          }),
        },
      );

      if (!signedUrlResponse.ok)
        throw new Error("Failed to get signed URL for image");

      const { signedUrl, fileName: imageFileName } =
        await signedUrlResponse.json();
      const fileName = imageFileName.replace("gs://", "");

      const uploadResponse = await fetch(signedUrl, {
        method: "PUT",
        body: image,
        headers: { "Content-Type": image.type },
        mode: "cors",
      });

      if (!uploadResponse.ok)
        throw new Error(`Failed to upload image: ${uploadResponse.status}`);

      // Update local state
      setFilteredTestCase((prev) => {
        if (!prev) return null;
        return { ...prev, screenshot_url: `${GCS_BUCKET_URL}${fileName}` };
      });

      // Update test case
      const updatedTestCase = {
        ...filteredTestCase,
        screenshot_url: `${GCS_BUCKET_URL}${fileName}`,
      } as testCaseSchema;
      await handleUpdateTestCase(updatedTestCase);

      // Update Redux
      dispatch(
        updateTestCase({
          id: filteredTestCase!.test_case_id,
          updatedData: { screenshot_url: `${GCS_BUCKET_URL}${fileName}` },
        }),
      );

      toast.success("Image uploaded successfully");
    } catch (error) {
      console.error("Error uploading image:", error);
      Sentry.captureException(error, {
        level: "error",
        tags: { priority: "high" },
      });
      toast.error(
        error instanceof Error ? error.message : "Failed to upload image",
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleAddTestRun = () => {
    setIsTestRunLoading(true);

    // Create test run data without a file
    const addTestRunData = {
      testRunName: "Record and Play",
      buildNumber: "1.0",
      platform: "ANDROID",
      productId: productSwitcher.product_id,
      executable_url: "", // No file is being uploaded
      deviceIds: "samsung_s24",
      test_case_ids: [testCase.test_case_id],
      acceptance_criteria: "",
      send_to_nova: false,
    };

    // Call the API to add a test run
    fetch(ADD_TEST_RUN_API_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ addTestRunData }),
    })
      .then((response) => {
        if (!response.ok) {
          Sentry.captureException(
            new Error(`Failed to add test run: ${response.status}`),
            {
              level: "fatal",
              tags: { priority: "high" },
            },
          );
          throw new Error(`Failed to add test run: ${response.status}`);
        }
        return response.json();
      })
      .then((responseData) => {
        console.log("Received response:", responseData);

        const testRunsArray = responseData.test_runs || [];

        if (!testRunsArray.length) {
          Sentry.captureException(
            new Error("Invalid test run response: no test runs created"),
            {
              level: "fatal",
              tags: { priority: "high" },
            },
          );
          throw new Error("Invalid test run response: no test runs created");
        }
        setTestRunId(testRunsArray[0].test_run_id);

        toast.success("Test Run Started Successfully");
        return testRunsArray[0].test_run_id;
      })
      .then(async (testRunId) => {
        const response = await fetch(
          `/api/get-test-case-under-execution?testRunId=${testRunId}`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
          },
        );

        if (!response.ok) {
          Sentry.captureException(
            new Error("Failed to fetch test cases under execution"),
            {
              level: "fatal",
              tags: { priority: "high" },
            },
          );
          throw new Error("Failed to fetch test cases under execution");
        }

        if (response.status === 401) {
          toast.error(
            "Session token expired, logging out the user to regenerate token",
          );
          return;
        }

        const result = await response.json();
        const tcueId = result[0]?.id;
        if (!tcueId) {
          Sentry.captureException(
            new Error("No Test Case Under Execution ID found"),
            {
              level: "fatal",
              tags: { priority: "high" },
            },
          );
          throw new Error("No Test Case Under Execution ID found");
        }
        const payloadForGoalPlanner = {
          executable_url: productSwitcher.google_play_store_url,
          product_id: productSwitcher.product_id,
          test_case_ids: [testCase.test_case_id],
          test_case_under_execution_ids: [tcueId],
          test_run_id: testRunId,
          mode: "BROWSER_DROID",
          platform: "ANDROID",
        };
        const goalPlanningresponse = await fetch("/api/goal-planning-handler", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payloadForGoalPlanner),
        });
        if (!goalPlanningresponse.ok) {
          Sentry.captureException(
            new Error(`Failed to plan goals: ${goalPlanningresponse.status}`),
            {
              level: "fatal",
              tags: { priority: "high" },
            },
          );
          throw new Error(
            `Failed to plan goals: ${goalPlanningresponse.status}`,
          );
        }
        const goalPlanningResult = await goalPlanningresponse.json();
        console.log(
          "Goal Planning Result first element type:",
          typeof goalPlanningResult.nova_params,
        );
        const firstElement = JSON.parse(goalPlanningResult.nova_params)[0];
        console.log("First element:", firstElement);
        const resonse = await fetch(`${ip}nova/trigger`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ nova_params: JSON.stringify(firstElement) }),
        });
        const finalResult = await resonse.json();
        console.log(
          "Response from browser-droid nova trigger endpoint:",
          finalResult,
        );
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
        setIsTestRunLoading(false);
      });
  };

  if (useInlineViewer && filteredTestCase) {
    return (
      <div className="flex flex-col h-full">
        <TestCaseDetailsViewerModal
          testCase={filteredTestCase}
          onClose={onClose}
          hasNext={false}
          hasPrev={false}
          currentPosition={0}
          totalCount={0}
          inline={true}
          handleAddTestRun={handleAddTestRun}
          testRunId={testRunId || undefined}
          productId={productSwitcher.product_id}
          isTestRunLoading={isTestRunLoading}
          onCriticalityChange={handleCriticalityChange}
          onTestCaseUpdate={handleUpdateTestCase}
          isEditing={true}
          isSaving={isLoading.status && isLoading.action === "saving"}
        />
      </div>
    );
  }

  return (
    <>
      {filteredTestCase ? (
        <div className="flex flex-col h-full">
          <TCHeader
            testCase={filteredTestCase}
            features={features}
            onClose={() => {}}
            onDelete={() => {}}
            onCopy={() => {}}
            onCriticalityChange={handleCriticalityChange}
            onStatusChange={handleStatusChange}
            onTestCaseUpdate={handleUpdateTestCase}
            isLoading={isLoading}
            isStatusLoading={false}
            currentPosition={0}
            totalCount={0}
            showFlowViewer={() => setshowFlowViewer(true)}
            isBrowserDroid={true}
            handleAddTestRun={handleAddTestRun}
            testRunId={testRunId || ""}
          />

          <div className="flex flex-1 min-h-0">
            <TCFrame
              testCase={filteredTestCase}
              onImageUpload={handleImageUpload}
              isUploading={isUploading}
            />

            <div className="flex-1 h-full bg-gray-50">
              <div className="h-full overflow-y-auto px-6 py-6">
                <div className="space-y-6">
                  <TCDetailsSection
                    testCase={filteredTestCase}
                    allTestCases={[]}
                    onSaveTestCase={async (updateData) => {
                      const updatedTestCase = {
                        ...filteredTestCase,
                        ...updateData,
                      };
                      setFilteredTestCase(updatedTestCase);
                      return await handleUpdateTestCase(updatedTestCase);
                    }}
                    isLoading={isLoading}
                    onCriticalityChange={handleCriticalityChange}
                  />

                  <hr className="border-gray-300" />
                </div>
              </div>
            </div>
          </div>

          {showFlowViewer && (
            <TestCaseFlowViewer
              metadata={filteredTestCase?.metadata || ""}
              open={showFlowViewer}
              onClose={() => setshowFlowViewer(false)}
            />
          )}
        </div>
      ) : (
        <ProductLoadingScreen message="Formulating test case, please wait" />
      )}
    </>
  );
}

export default function CustomPage() {
  const { productSwitcher } = useProductSwitcher();
  const params = useParams();
  const serverParam = params.server;
  const [requestId, setRequestId] = useState(null);
  const [testCase, setTestCase] = useState<testCaseSchema | null>();
  const getTestCasesForProduct = async (request_id: string) => {
    if (!request_id || request_id == "IN_PROCESS") {
      return;
    }
    try {
      const response = await fetch(
        `/api/get-test-cases-for-request?request_id=${request_id}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        throw new Error("Failed to fetch test cases");
      }

      if (response.status === 401) {
        toast.error(
          "Session token expired, logging out the user to regenerate token",
        );
      }

      const result = await response.json();
      toast.success("Test cases fetched successfully");
      return result.test_cases[0];
    } catch (error) {
      console.error("Error fetching test cases:", error);
    }
  };

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const data = event.data;

      if (data && typeof data === "object" && "requestId" in data) {
        setRequestId(data.requestId);
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    const fetchTestCase = async () => {
      try {
        const tc = await getTestCasesForProduct(requestId || "");

        if (tc) {
          console.log("✅ Found test case:", tc);
          setTestCase(tc as testCaseSchema);
          // stop polling once we have the correct test case
          clearInterval(intervalId);
        } else {
          console.log("❌ No test case yet, will retry...");
        }
      } catch (err) {
        console.error("Error fetching test case:", err);
      }
    };

    if (requestId) {
      // first fetch immediately
      fetchTestCase();

      // then poll every 10s
      intervalId = setInterval(fetchTestCase, 10000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [requestId]);

  const server = Array.isArray(serverParam) ? serverParam[0] : serverParam;
  const ip = SERVER_IP_MAP[server];
  if (!productSwitcher.product_id) {
    return (
      <ProductLoadingScreen message="Please wait while we load browser-droid for you" />
    );
  }

  return (
    <div className="flex h-screen w-full">
      <div className="w-5/12 border-r border-gray-300">
        <iframe
          src={`/browserdroid/index.html?product=${encodeURIComponent(productSwitcher.product_id)}&server=${ip}`}
          className="w-full h-full border-none"
          title="Custom HTML Page"
          id="browserdroid-iframe"
        />
      </div>

      {requestId == null && (
        <ProductLoadingScreen message="Please record session to view test case here" />
      )}
      {requestId == "IN_PROCESS" && !testCase && (
        <ProductLoadingScreen message="Formulating test case, please wait" />
      )}
      {testCase && (
        <ShowTcDetail
          testCase={testCase}
          onClose={() => {
            setTestCase(null);
            setRequestId(null);
            // Clear URL parameters
            const params = new URLSearchParams(window.location.search);
            params.delete("test_case_id");
            const newUrl = params.toString()
              ? `${window.location.pathname}?${params.toString()}`
              : window.location.pathname;
            window.history.replaceState(null, "", newUrl);
          }}
          ip={ip}
        />
      )}
    </div>
  );
}
