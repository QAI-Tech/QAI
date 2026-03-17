"use client";

import type React from "react";
import { useState, useEffect, useMemo } from "react";
import { useSelector, useDispatch } from "react-redux";
import type { RootState, AppDispatch } from "@/app/store/store";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useProductSwitcher } from "@/providers/product-provider";
import { CriticalitySelect } from "@/components/ui/criticality-select";
import {
  ADD_TEST_CASE_API_ENDPOINT,
  GCS_BUCKET_URL,
  PRODUCTION_ORGANISATION_ID,
  PRODUCT_DESIGN_ASSETS_BUCKET_NAME,
} from "@/lib/constants";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, GripVertical, Plus, Trash2, ChevronDown } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import {
  type testCaseRequestSchema,
  type testCaseSchema,
  type TestCaseStep,
  TestCaseType,
  type Feature,
  Criticality,
  type Scenario,
} from "@/lib/types";
import { ScreenPreview } from "./screen-preview";
import { addTestCase } from "@/app/store/testCaseSlice";
import { useUser } from "@clerk/nextjs";
import { Combobox } from "@/components/ui/combobox-pop-search";
import { addFeature, deleteFeature } from "@/app/store/featuresSlice";
import { DeleteConfirmationDialog } from "@/app/(dashboard)/[product]/homev1/test-cases/components/delete-confirmation-dialog";
import { TestCaseCredentials } from "@/components/ui/test-case-credentials";
import { Scenarios } from "./scenarios";
import {
  shouldPreventDrag,
  handleDraggableMouseDown,
  ValidationPatterns,
  validateInputWithMessage,
} from "@/lib/utils";
import { fetchCredentials } from "@/app/store/credentialsSlice";
import { StepMenu } from "@/components/ui/step-menu";
import * as Sentry from "@sentry/nextjs";

// ComboboxOption interface for feature dropdown
interface ComboboxOption {
  value: string;
  label: string;
  isFeature?: boolean;
}

export default function AddTestCaseManually({
  open,
  onClose,
  prefillData,
}: {
  open: boolean;
  onClose: () => void;
  prefillData?: testCaseSchema;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [feature, setFeature] = useState(prefillData?.feature_id || "");
  const [title, setTitle] = useState(prefillData?.title || "");
  const [type, setType] = useState<TestCaseType>(
    prefillData?.test_case_type || TestCaseType.smoke,
  );
  const { productSwitcher } = useProductSwitcher();
  const [preconditions, setPreconditions] = useState<string[]>(
    prefillData?.preconditions || [],
  );
  const [description, setDescription] = useState(
    prefillData?.test_case_description || "",
  );
  const [descriptionError, setDescriptionError] = useState<string | undefined>(
    undefined,
  );
  const [criticality, setCriticality] = useState<Criticality>(
    prefillData?.criticality || Criticality.HIGH,
  );
  const features =
    useSelector((state: RootState) => state.features.features) || [];

  // Get all test cases from Redux store
  const allTestCases =
    useSelector((state: RootState) => state.testCases.testCases) || [];

  // State for precondition test case selection
  const [preconditionTestCaseId, setPreconditionTestCaseId] =
    useState<string>("");

  const dispatch = useDispatch<AppDispatch>();
  const { user } = useUser();
  const organisationId =
    user?.publicMetadata?.organisation_id || PRODUCTION_ORGANISATION_ID;

  const [selectedCredentialIds, setSelectedCredentialIds] = useState<string[]>(
    [],
  );
  const [shouldShowAdvancedSection, setShouldShowAdvancedSection] =
    useState(false);
  const [screenshotUrl, setScreenshotUrl] = useState<string>(
    prefillData?.screenshot_url || "",
  );
  const [isUploading, setIsUploading] = useState(false);
  const [draggedStepIndex, setDraggedStepIndex] = useState<number | null>(null);
  const [shouldAddNewFeature, setShouldAddNewFeature] = useState(false);
  const [newFeatureName, setNewFeatureName] = useState("");
  const [featureNameToDelete, setFeatureNameToDelete] = useState<string>("");
  const [showFeatureDeleteConfirmation, setShowFeatureDeleteConfirmation] =
    useState(false);

  const validateDescription = () => {
    if (!description.trim()) {
      setDescriptionError("Description is required");
      return false;
    }

    const validationResult = validateInputWithMessage(
      ValidationPatterns.generalName,
      description,
      "Description must be between 1-1000 characters",
    );

    if (!validationResult.isValid) {
      setDescriptionError(validationResult.errorMessage);
      return false;
    }

    setDescriptionError(undefined);
    return true;
  };

  const handleDescriptionChange = (
    e: React.ChangeEvent<HTMLTextAreaElement>,
  ) => {
    const newDescription = e.target.value;
    setDescription(newDescription);

    // Clear error when typing or validate immediately if there was an error
    if (descriptionError) {
      validateDescription();
    }
  };

  const handleAdvancedSectionToggle = () => {
    const newState = !shouldShowAdvancedSection;
    setShouldShowAdvancedSection(newState);

    if (newState && productSwitcher.product_id) {
      dispatch(fetchCredentials(productSwitcher.product_id));
    }
  };

  // const [selectedScreen, setSelectedScreen] = useState<string>(
  //   "https://storage.googleapis.com/uxpilot-auth.appspot.com/c19b95a9e8-71cfc9ac303d9d06b6c7.png",
  // );

  //Todo: Uncomment after building upload feature
  // const [isUploading, setIsUploading] = useState(false);
  // const [uploadedImage, setUploadedImage] = useState<string | null>(null);

  // const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
  //   console.log(e?.target?.files?.[0]);
  //Todo: Complete this post discussion with team.
  // const file = e.target.files?.[0];
  // if (!file) return;

  // // Validate file type
  // if (!file.type.startsWith("image/")) {
  //   alert("Please upload an image file");
  //   return;
  // }

  // setIsUploading(true);
  // try {
  //   // Create FormData
  //   const formData = new FormData();
  //   formData.append("file", file);

  //   // Upload image
  //   const response = await fetch("/api/uploadImage", {
  //     method: "POST",
  //     body: formData,
  //   });

  //   if (!response.ok) {
  //     throw new Error("Failed to upload image");
  //   }

  //   const data = await response.json();
  //   setUploadedImage(data.url);
  //   setSelectedScreen(data.url);
  // } catch (error) {
  //   console.error("Error uploading image:", error);
  //   alert("Failed to upload image");
  // } finally {
  //   setIsUploading(false);
  // }
  // };
  const [steps, setSteps] = useState<TestCaseStep[]>(() => {
    if (
      prefillData?.test_case_steps &&
      prefillData.test_case_steps.length > 0
    ) {
      return prefillData.test_case_steps.map((step) => ({
        ...step,
        test_step_id: uuidv4(),
      }));
    }
    return [
      {
        test_step_id: uuidv4(),
        step_description: "",
        expected_results: [""],
      },
    ];
  });

  useEffect(() => {
    const credentials = prefillData?.credentials;
    if (credentials && Array.isArray(credentials) && credentials.length > 0) {
      setSelectedCredentialIds(credentials);
      setShouldShowAdvancedSection(true);
    }
  }, [prefillData]);

  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [testCase, setTestCase] = useState<testCaseSchema>({
    feature_id: feature,
    preconditions: preconditions,
    test_case_type: type,
    test_case_description: description,
    screenshot_url: screenshotUrl,
    criticality,
    test_case_steps: steps,
    scenarios,
    test_case_id: "",
    created_at: new Date().toISOString(),
  });

  const scenariosInput = useMemo(
    () => ({
      ...testCase,
      preconditions: preconditions,
      test_case_description: description,
      test_case_steps: steps,
    }),
    [testCase, preconditions, description, steps],
  );

  useEffect(() => {
    // Will Only set values if dialog box is open and prefillData exists
    if (open && prefillData) {
      setFeature(prefillData.feature_id || "");
      setTitle(prefillData.title || "");
      setType(prefillData.test_case_type || TestCaseType.smoke);
      setPreconditions(prefillData.preconditions || []);
      setDescription(prefillData.test_case_description || "");
      setScreenshotUrl(prefillData.screenshot_url || "");
      setCriticality(prefillData.criticality || Criticality.HIGH);
      setScenarios(prefillData.scenarios || []);
      setSteps(
        prefillData.test_case_steps || [
          {
            test_step_id: uuidv4(),
            step_description: "",
            expected_results: [""],
          },
        ],
      );
    }
    setTestCase({
      feature_id: prefillData?.feature_id || feature,
      test_case_type: prefillData?.test_case_type || type,
      preconditions: prefillData?.preconditions || preconditions,
      test_case_description: prefillData?.test_case_description || description,
      screenshot_url: prefillData?.screenshot_url || screenshotUrl,
      criticality: prefillData?.criticality || criticality,
      test_case_steps: prefillData?.test_case_steps || steps,
      scenarios: prefillData?.scenarios || scenarios,
      test_case_id: "",
      created_at: new Date().toISOString(),
      title: prefillData?.title || title,
    });
  }, [open, prefillData]);

  // Reset all form fields when the dialog is closed
  const handleClose = () => {
    if (!prefillData) {
      setFeature("");
      setTitle("");
      setType(TestCaseType.smoke);
      setPreconditions([]);
      setDescription("");
      setDescriptionError(undefined);
      setScreenshotUrl("");
      setCriticality(Criticality.HIGH);
      setScenarios([]);
      setSteps([
        {
          test_step_id: uuidv4(),
          step_description: "",
          expected_results: [""],
        },
      ]);
      setNewFeatureName("");
      setShouldAddNewFeature(false);
      setSelectedCredentialIds([]);
      setShouldShowAdvancedSection(false);
    }
    onClose();
  };

  const addStep = () => {
    setSteps([
      ...steps,
      {
        test_step_id: uuidv4(),
        step_description: "",
        expected_results: [""],
      },
    ]);
  };

  const addExpectedResult = (stepIndex: number) => {
    setSteps((prevSteps) =>
      prevSteps.map((step, idx) =>
        idx === stepIndex
          ? { ...step, expected_results: [...step.expected_results, ""] }
          : step,
      ),
    );
  };

  const deleteExpectedResult = (stepIndex: number) => {
    if (steps[stepIndex].expected_results.length <= 1) return; // Don't delete if there's only one expected result

    setSteps((prevSteps) =>
      prevSteps.map((step, idx) =>
        idx === stepIndex
          ? { ...step, expected_results: step.expected_results.slice(0, -1) }
          : step,
      ),
    );
  };

  const updateStepDescription = (stepIndex: number, description: string) => {
    setSteps((prevSteps) =>
      prevSteps.map((step, idx) =>
        idx === stepIndex ? { ...step, step_description: description } : step,
      ),
    );
  };

  const updateExpectedResult = (
    stepIndex: number,
    resultIndex: number,
    result: string,
  ) => {
    const newSteps = steps.map((step, idx) => {
      if (idx === stepIndex) {
        // Created a new array for expected_results
        const newExpectedResults = [...step.expected_results];
        newExpectedResults[resultIndex] = result;

        // Will Return a new step object with the updated expected_results
        return {
          ...step,
          expected_results: newExpectedResults,
        };
      }
      return step; // Otherwise It will return old
    });

    setSteps(newSteps);
  };

  // Step management functions for StepMenu
  const addStepBefore = (index: number) => {
    const newStep: TestCaseStep = {
      test_step_id: uuidv4(),
      step_description: "",
      expected_results: [""],
    };

    const updatedSteps = [...steps];
    updatedSteps.splice(index, 0, newStep);
    setSteps(updatedSteps);
  };

  const addStepAfter = (index: number) => {
    const newStep: TestCaseStep = {
      test_step_id: uuidv4(),
      step_description: "",
      expected_results: [""],
    };

    const updatedSteps = [...steps];
    updatedSteps.splice(index + 1, 0, newStep);
    setSteps(updatedSteps);
  };

  const deleteSpecificStep = (index: number) => {
    const updatedSteps = [...steps];
    updatedSteps.splice(index, 1);
    setSteps(updatedSteps);
  };

  // Feature dropdown functions
  const mapFeaturesToOptions = (features: Feature[]): ComboboxOption[] => {
    // Added "Add a feature" option at the top
    const options = features.map((feature) => ({
      value: feature.id,
      label: feature.name,
      isFeature: true,
    }));

    options.unshift({
      value: "add_new_feature",
      label: "Add a feature",
      isFeature: false,
    });

    return options;
  };

  const featureOptions = mapFeaturesToOptions(features);

  const handleFeatureChange = (value: string) => {
    // If "Add new feature" is selected, then it will show the input field
    if (value === "add_new_feature") {
      setShouldAddNewFeature(true);
      setNewFeatureName(""); // To Clear any previous input
      return;
    }

    // To Update the selected feature
    setFeature(value);
    setShouldAddNewFeature(false);
  };

  // To Cancel adding a new feature input field
  const handleCancelAddFeature = () => {
    setShouldAddNewFeature(false);
    setNewFeatureName("");
  };

  const [featureToDelete, setFeatureToDelete] = useState<string | null>(null);

  const handleFeatureDeleteClick = (e: React.MouseEvent, featureId: string) => {
    e.stopPropagation();

    const feature = features.find((f) => f.id === featureId);
    setFeatureToDelete(featureId);
    setFeatureNameToDelete(feature?.name || "");
    setShowFeatureDeleteConfirmation(true);
  };

  const handleConfirmFeatureDelete = async () => {
    if (!featureToDelete || isLoading || !productSwitcher.product_id) return;

    try {
      setIsLoading(true);

      const deleteData = {
        id: featureToDelete,
        product_id: productSwitcher.product_id,
      };

      console.log("Deleting feature:", deleteData);

      // Call API to delete feature
      const response = await fetch("/api/delete-feature", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(deleteData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Error response:", errorData);
        throw new Error(
          `Failed to delete feature: ${errorData.error || "Unknown error"}`,
        );
      }

      // Update Redux store
      dispatch(deleteFeature(featureToDelete));

      // If current test case uses the deleted feature, reset the feature selection
      if (feature === featureToDelete) {
        setFeature("");
      }

      toast.success(`Feature "${featureNameToDelete}" deleted successfully`);
    } catch (error) {
      console.error("Error deleting feature:", error);
      Sentry.captureException(error, {
        level: "fatal",
        tags: { priority: "high" },
      });
      toast.error(
        error instanceof Error ? error.message : "Failed to delete feature",
      );
    } finally {
      setIsLoading(false);
      setFeatureToDelete(null);
      setFeatureNameToDelete("");
      setShowFeatureDeleteConfirmation(false);
    }
  };

  const handleCancelFeatureDelete = () => {
    setFeatureToDelete(null);
    setFeatureNameToDelete("");
    setShowFeatureDeleteConfirmation(false);
  };

  // Custom render function for Combobox items to include delete buttons
  const renderFeatureOption = (option: ComboboxOption) => {
    if (!option.isFeature) {
      return (
        <div className="flex items-center text-purple-600 font-medium">
          <Plus className="h-4 w-4 mr-2" />
          {option.label}
        </div>
      );
    }

    return (
      <div className="flex justify-between items-center w-full group">
        <span>{option.label}</span>
        <Button
          onClick={(e) => handleFeatureDeleteClick(e, option.value)}
          variant="ghost"
          className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Delete feature"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    );
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

      const product_id = productSwitcher.product_id;

      if (!product_id) {
        toast.error("No product selected");
        return;
      }

      const uploadPath = `${organisationId}/${product_id}/${feature}/${crypto.randomUUID()}_frame.${extension}`;

      console.log("Uploading image with path:", uploadPath);

      const signedUrlResponse = await fetch(
        `/api/generate-instructions?getSignedUrl=true&bucketName=${PRODUCT_DESIGN_ASSETS_BUCKET_NAME}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: uploadPath,
            contentType: image.type,
          }),
        },
      );

      if (!signedUrlResponse.ok) {
        throw new Error("Failed to get signed URL for image");
      }

      const { signedUrl, fileName: imageFileName } =
        await signedUrlResponse.json();

      const fileName = imageFileName.replace("gs://", "");
      console.log("File Name:", fileName);

      const uploadResponse = await fetch(signedUrl, {
        method: "PUT",
        body: image,
        headers: {
          "Content-Type": image.type,
        },
        mode: "cors",
      });

      if (!uploadResponse.ok) {
        throw new Error(`Failed to upload image: ${uploadResponse.status}`);
      }

      const viewSignedUrlResponse = await fetch(
        `/api/generate-signed-url-for-frame?framePath=${fileName}`,
        {
          method: "GET",
        },
      );

      if (!viewSignedUrlResponse.ok) {
        throw new Error("Failed to get signed URL for viewing image");
      }

      const { signedUrl: viewSignedUrl } = await viewSignedUrlResponse.json();

      setScreenshotUrl(`${GCS_BUCKET_URL}${fileName}`);

      console.log("Screenshot URI stored:", fileName);
      console.log("Temporary view URL:", viewSignedUrl);

      toast.success("Image uploaded successfully");
    } catch (error) {
      console.error("Error uploading image:", error);
      Sentry.captureException(error, {
        level: "error",
        tags: { priority: "medium" },
      });
      toast.error(
        error instanceof Error ? error.message : "Failed to upload image",
      );
    } finally {
      setIsUploading(false);
    }
  };

  // Drag and drop handlers for steps
  const handleStepDragStart = (e: React.DragEvent, index: number) => {
    // Used utility function to check if drag should be prevented
    if (shouldPreventDrag(e)) {
      return;
    }

    e.dataTransfer.effectAllowed = "move";
    setDraggedStepIndex(index);
    e.dataTransfer.setData("text/plain", `step-${index}`);

    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.classList.add("dragging");
    }
  };

  const handleStepDragOver = (e: React.DragEvent, index: number) => {
    if (draggedStepIndex === null) return;
    e.preventDefault();
    console.log(index);
    e.dataTransfer.dropEffect = "move";

    // Add visual feedback
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.classList.add("drag-over");
    }
  };

  const handleStepDragLeave = (e: React.DragEvent) => {
    // Remove visual feedback
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.classList.remove("drag-over");
    }
  };

  const handleStepDrop = (e: React.DragEvent, dropIndex: number) => {
    if (draggedStepIndex === null) return;
    e.preventDefault();

    // Remove visual feedback
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.classList.remove("drag-over");
    }

    // Reorder steps
    const newSteps = Array.from(steps);
    const [draggedStep] = newSteps.splice(draggedStepIndex, 1);
    newSteps.splice(dropIndex, 0, draggedStep);
    setSteps(newSteps);

    setDraggedStepIndex(null);
  };

  const handleStepDragEnd = (e: React.DragEvent) => {
    setDraggedStepIndex(null);

    // Remove any visual feedback
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.classList.remove("dragging");
    }

    // Remove drag-over class from all step elements
    document.querySelectorAll(".step-item").forEach((el) => {
      el.classList.remove("drag-over");
    });
  };

  const cleanTestCase = (testCase: testCaseRequestSchema) => {
    const cleanedSteps = testCase.test_case_steps
      .filter((step) => step.step_description?.trim()) // remove steps with empty or null description
      .map((step) => ({
        ...step,
        expected_results: step.expected_results.filter((result) =>
          result?.trim(),
        ), // remove empty/null expected results
      }));

    const preconditions = testCase.preconditions || [];
    const cleanedPreconditions = preconditions.some((p) => p.trim())
      ? preconditions
      : [];

    return {
      ...testCase,
      test_case_steps: cleanedSteps,
      preconditions: cleanedPreconditions,
    };
  };

  // Function to add new feature
  const addNewFeature = async () => {
    if (!productSwitcher.product_id || !newFeatureName.trim()) {
      return null;
    }

    try {
      const featureData = {
        product_id: productSwitcher.product_id,
        name: newFeatureName,
      };

      console.log("Adding feature:", featureData);

      // Call the API to add the feature
      const response = await fetch("/api/add-feature", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(featureData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Error response:", errorData);
        throw new Error(
          `Failed to add feature: ${errorData.error || "Unknown error"}`,
        );
      }

      const newFeature: Feature = await response.json();
      console.log("New feature created:", newFeature);

      // Update Redux store
      dispatch(addFeature(newFeature));

      toast.success("Feature added successfully");

      return newFeature.id;
    } catch (error) {
      console.error("Error adding feature:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to add feature",
      );
      return null;
    }
  };

  const handleSubmit = async () => {
    // Validate description
    const isDescriptionValid = validateDescription();

    if (!isDescriptionValid) {
      toast.error("Description is required");
      return;
    }

    setIsSaving(true);
    try {
      // If user is adding a new feature, the first it will create
      let featureId = feature;
      if (shouldAddNewFeature && newFeatureName.trim()) {
        const newFeatureId = await addNewFeature();
        if (newFeatureId) {
          featureId = newFeatureId;
        } else {
          setIsSaving(false);
          return;
        }
      }

      const finalTestCase = {
        created_at: new Date().toISOString(),
        preconditions: preconditions,
        test_case_type: type,
        test_case_description: description,
        test_case_steps: steps,
        feature_id: featureId,
        product_id: productSwitcher.product_id,
        screenshot_url: screenshotUrl,
        criticality: criticality,
        credentials: selectedCredentialIds,
        scenarios: testCase.scenarios || [],
        precondition_test_case_id: preconditionTestCaseId,
        title: title.trim(),
      };

      const filteredTestCase = cleanTestCase(
        finalTestCase as testCaseRequestSchema,
      );

      console.log(
        "New Test Case: " +
          JSON.stringify({ addTestCaseData: filteredTestCase }),
      );

      const response = await fetch(ADD_TEST_CASE_API_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ addTestCaseData: filteredTestCase }),
      });

      if (!response.ok) {
        throw new Error("Failed to save test case");
      }
      const response_from_backend = await response.json();
      const testCaseId = response_from_backend.test_case_id;

      // Created a complete test case object by combining the test case data with the testCase_Id
      const completeTestCase: testCaseSchema = {
        ...filteredTestCase,
        test_case_id: testCaseId,
        credentials: selectedCredentialIds,
      };

      console.log("Complete test case object with ID:", completeTestCase);

      // Dispatching the complete test case to Redux
      dispatch(addTestCase(completeTestCase));

      toast.success("Test Case Added Successfully");
      handleClose();
    } catch (error) {
      Sentry.captureException(error, {
        level: "error",
        tags: { priority: "high" },
      });
      console.error("Error saving test case:", error);
      toast.error("Failed to save test case");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-[700px] py-2 max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="mt-2">Add New Test Case</DialogTitle>
        </DialogHeader>

        {/* Feature Delete Confirmation Dialog */}
        <DeleteConfirmationDialog
          isOpen={showFeatureDeleteConfirmation}
          isDeleting={isLoading}
          title="Delete Feature"
          description={`Are you sure you want to delete the feature "${featureNameToDelete}"?`}
          onConfirm={handleConfirmFeatureDelete}
          onCancel={handleCancelFeatureDelete}
        />

        <div className="grid grid-cols-2 gap-4">
          {/* Left column - Form Fields */}
          <div className="space-y-4">
            {/* Feature */}
            <div>
              <label className="block text-sm font-medium mb-2">Feature</label>
              {shouldAddNewFeature ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={newFeatureName}
                    onChange={(e) => setNewFeatureName(e.target.value)}
                    placeholder="Enter feature name"
                    className="flex-1"
                    disabled={isSaving}
                  />
                  <Button
                    variant="outline"
                    onClick={handleCancelAddFeature}
                    disabled={isSaving}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Combobox
                  options={featureOptions}
                  value={feature}
                  onChange={handleFeatureChange}
                  placeholder="Search feature..."
                  emptyMessage="No feature found."
                  buttonLabel="Select feature..."
                  renderOption={renderFeatureOption}
                  popoverClassName="w-[var(--radix-popover-trigger-width)] min-w-full"
                  disabled={isSaving} // Disabled dropdown when loading
                />
              )}
            </div>
            {/* Title */}
            <div>
              <label className="block text-sm font-medium mb-2">Title</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter title (optional)"
                className="w-full"
                disabled={isSaving}
              />
            </div>

            {/* Precondition Test Case Dropdown */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Precondition Test Case
              </label>
              <Combobox
                options={[
                  { value: "", label: "None" }, // Option to clear selection
                  ...allTestCases
                    .filter(
                      (tc) =>
                        !prefillData ||
                        tc.test_case_id !== prefillData.test_case_id,
                    )
                    .map((tc) => ({
                      value: tc.test_case_id,
                      label: tc.title ? tc.title : tc.test_case_description,
                    })),
                ]}
                value={preconditionTestCaseId}
                onChange={setPreconditionTestCaseId}
                placeholder="Select a precondition test case..."
                emptyMessage="No test case found."
                buttonLabel="Select Test Case..."
                disabled={isSaving}
                popoverClassName="w-[var(--radix-popover-trigger-width)] min-w-full"
              />
            </div>

            {/* Type - I have hidden for now , by default Smoke will be selected*/}
            <div className="hidden">
              <label className="block text-sm font-medium mb-2">Type</label>
              <Select
                value={type}
                onValueChange={(value) => setType(value as TestCaseType)}
                disabled={isSaving}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SMOKE">SMOKE</SelectItem>
                  <SelectItem value="OBSTRUCTION">OBSTRUCTION</SelectItem>
                  <SelectItem value="UI">UI</SelectItem>
                  <SelectItem value="ACTION">ACTION</SelectItem>
                  <SelectItem value="ROUTE">ROUTE</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Criticality
              </label>
              <CriticalitySelect
                value={criticality}
                onValueChange={(value) => setCriticality(value)}
                disabled={isSaving}
              />
            </div>

            {/* Preconditions */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Preconditions
              </label>
              <Textarea
                placeholder="Enter preconditions..."
                value={preconditions.join("\n")}
                onChange={(e) => setPreconditions(e.target.value.split("\n"))}
                className="min-h-[80px]"
                disabled={isSaving}
              />
            </div>

            {/* Advanced Preconditions Section */}
            <div className="mt-4">
              <div
                className="flex items-center cursor-pointer"
                onClick={handleAdvancedSectionToggle}
              >
                <div className="flex items-center text-purple-600">
                  <span className="text-sm font-medium">
                    Advanced Precondition
                  </span>
                  <div
                    className={`ml-1 transition-transform ${shouldShowAdvancedSection ? "rotate-180" : ""}`}
                  >
                    <ChevronDown className="h-4 w-4 text-purple-600" />
                  </div>
                </div>
              </div>

              {shouldShowAdvancedSection && (
                <div className="mt-4 space-y-4 p-4 border border-gray-200 rounded-md">
                  <p className="font-medium mb-2">Test Credentials :</p>
                  <TestCaseCredentials
                    productId={productSwitcher.product_id}
                    credentialIds={selectedCredentialIds}
                    testCaseId={undefined}
                    isEditing={true}
                    isSaving={isSaving}
                    onCredentialChange={(credentialId) => {
                      setSelectedCredentialIds((prev) => {
                        const newCredentials = prev.includes(credentialId)
                          ? prev.filter((id) => id !== credentialId)
                          : [...prev, credentialId];
                        return newCredentials;
                      });
                    }}
                    onCredentialRemove={(credentialId) => {
                      setSelectedCredentialIds((prev) =>
                        prev.filter((id) => id !== credentialId),
                      );
                    }}
                  />
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-center">
              Screen
            </label>
            <div className="flex flex-col items-center w-full">
              <div className="flex flex-col items-center justify-center h-full w-full">
                {screenshotUrl ? (
                  <div className="w-full">
                    <ScreenPreview mainImage={screenshotUrl} isDialog={true} />
                  </div>
                ) : (
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 flex flex-col items-center justify-center text-center h-[300px] w-full">
                    <p className="text-gray-500 mb-2">No image uploaded</p>
                    <p className="text-gray-400 text-sm">
                      Upload an image to preview it here
                    </p>
                  </div>
                )}
                <div className="mt-4">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    id="imageUpload"
                    onChange={handleImageUpload}
                    disabled={isSaving || isUploading}
                  />
                  <Button
                    variant="outline"
                    className="flex justify-center items-center gap-2 bg-transparent"
                    onClick={() =>
                      document.getElementById("imageUpload")?.click()
                    }
                    disabled={isSaving || isUploading}
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      "Upload Image"
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Description <span className="text-red-500">*</span>
          </label>
          <Textarea
            placeholder="Enter description..."
            value={description}
            onChange={handleDescriptionChange}
            onBlur={validateDescription}
            className={`min-h-[100px] ${descriptionError ? "border-red-500" : ""}`}
            disabled={isLoading}
          />
          {descriptionError && (
            <p className="text-sm text-red-500 mt-1">{descriptionError}</p>
          )}
        </div>

        {/* Steps & Expected Results */}
        <div className="mt-6">
          <label className="block text-sm font-medium mb-2">
            Steps & Expected Results
          </label>
          <div className="space-y-4">
            {steps.map((step, stepIndex) => (
              <div
                key={step.test_step_id}
                className={`grid grid-cols-2 gap-4 p-3 rounded-md step-item border border-gray-200 relative group ${draggedStepIndex === stepIndex ? "opacity-50" : ""}`}
                draggable={!isSaving}
                onDragStart={(e) => handleStepDragStart(e, stepIndex)}
                onDragOver={(e) => handleStepDragOver(e, stepIndex)}
                onDragLeave={handleStepDragLeave}
                onDrop={(e) => handleStepDrop(e, stepIndex)}
                onDragEnd={handleStepDragEnd}
                onMouseDown={(e) => handleDraggableMouseDown(e, !isSaving)}
              >
                {/* Add StepMenu component */}
                <StepMenu
                  isEditing={!isSaving}
                  onDeleteStep={() => deleteSpecificStep(stepIndex)}
                  onAddStepBefore={() => addStepBefore(stepIndex)}
                  onAddStepAfter={() => addStepAfter(stepIndex)}
                />

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="cursor-grab">
                      <GripVertical className="h-5 w-5 text-gray-400" />
                    </div>
                    <div className="font-medium text-sm text-gray-500">
                      Step {stepIndex + 1}
                    </div>
                  </div>
                  <Textarea
                    placeholder="Step description"
                    value={step.step_description}
                    onChange={(e) =>
                      updateStepDescription(stepIndex, e.target.value)
                    }
                    disabled={isSaving}
                    className="min-h-[60px]"
                  />
                  {/* Removed the step plus/minus buttons */}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="font-medium text-sm text-gray-500">
                      Expected Results
                    </div>
                  </div>
                  {step.expected_results.map((result, resultIndex) => (
                    <Textarea
                      key={resultIndex}
                      // placeholder={`Expected result ${resultIndex + 1}`}
                      placeholder={`Expected result`}
                      value={result}
                      onChange={(e) =>
                        updateExpectedResult(
                          stepIndex,
                          resultIndex,
                          e.target.value,
                        )
                      }
                      disabled={isSaving}
                      className="min-h-[50px]"
                    />
                  ))}
                  <div className="flex gap-2">
                    <Button
                      onClick={() => addExpectedResult(stepIndex)}
                      className="w-8 h-8 rounded-full bg-purple-500 hover:bg-purple-600 flex items-center justify-center hidden"
                      disabled={isSaving}
                    >
                      <span className="text-2xl text-white">+</span>
                    </Button>
                    {step.expected_results.length > 1 && (
                      <Button
                        onClick={() => deleteExpectedResult(stepIndex)}
                        className="w-8 h-8 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center"
                        disabled={isSaving}
                      >
                        <span className="text-2xl text-white">-</span>
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {/* Show add step button if no steps exist */}
            {steps.length === 0 && (
              <div className="flex justify-start">
                <Button
                  onClick={addStep}
                  className="bg-purple-500 hover:bg-purple-600 text-white flex items-center gap-2"
                  disabled={isSaving}
                >
                  <Plus className="h-4 w-4" /> Add First Step
                </Button>
              </div>
            )}
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">Scenarios</label>
          <div>
            <Scenarios
              input={scenariosInput}
              setInput={setTestCase}
              readOnly={false}
            />
          </div>
        </div>
        {/* Save Button */}
        <div className="flex justify-center mt-6">
          <Button
            onClick={handleSubmit}
            disabled={isSaving}
            className="mb-2 bg-purple-600 hover:bg-purple-700 px-8 py-3 rounded-lg font-medium"
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Test Case"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
