"use client";

import { useState, useEffect } from "react";
import { useDispatch } from "react-redux";
import { CollapsiblePreconditions } from "@/components/ui/preconditions";
import { TestCaseCredentials } from "@/components/ui/test-case-credentials";
import { Scenarios } from "@/app/(dashboard)/[product]/homev1/test-cases/components/scenarios";
import { ChevronDown, AlertTriangle } from "lucide-react";
import { useUser } from "@clerk/nextjs";
import { isQaiOrgUser, isQaiOrgAnalystUser } from "@/lib/constants";
import { useProductSwitcher } from "@/providers/product-provider";
import { toast } from "sonner";
import { fetchCredentials } from "@/app/store/credentialsSlice";
import type {
  testCaseSchema,
  SaveTestCaseFunction,
  Criticality,
  Feature,
} from "@/lib/types";
import type { AppDispatch } from "@/app/store/store";
import { Textarea } from "@/components/ui/textarea";
import { CollapsibleSteps } from "@/components/ui/steps";
import { PreconditionTestCase } from "@/components/ui/precondition-test-case";
import { TCMirroredTestCases } from "./tc-mirrored-test-cases";
import { CriticalitySelect } from "@/components/ui/criticality-select";
import { TCHeader } from "@/app/(dashboard)/[product]/homev1/test-cases/components/tc-header";

interface TCDetailsSectionProps {
  testCase: testCaseSchema;
  allTestCases: testCaseSchema[];
  features?: Feature[];
  onSaveTestCase: SaveTestCaseFunction;
  onTestCaseUpdate?: (updatedTestCase: testCaseSchema) => Promise<boolean>;
  isLoading: {
    status: boolean;
    action?: string | null;
  };
  onCriticalityChange: (value: Criticality) => Promise<void>;
  showCriticality?: boolean;
  showDescription?: boolean;
  showSteps?: boolean;
  canEditPreconditions?: boolean;
  canEditMirrored?: boolean;
  canEditCredentials?: boolean;
  canEditPreconditionTestCase?: boolean;
  viewerLayout?: boolean;
  renderTopSections?: boolean;
  renderBottomSections?: boolean;
}

export function TCDetailsSection({
  testCase,
  allTestCases,
  features = [],
  onSaveTestCase,
  onTestCaseUpdate,
  isLoading,
  onCriticalityChange,
  showCriticality = true,
  showDescription = true,
  showSteps = true,
  canEditPreconditions = true,
  canEditMirrored = true,
  canEditCredentials = true,
  canEditPreconditionTestCase = true,
  viewerLayout = false,
  renderTopSections = false,
  renderBottomSections = false,
}: TCDetailsSectionProps) {
  const { user } = useUser();
  const { productSwitcher } = useProductSwitcher();
  const dispatch = useDispatch<AppDispatch>();
  const userOrgId = user?.publicMetadata?.organisation_id as string | undefined;
  const isQaiUser = isQaiOrgUser(userOrgId) || isQaiOrgAnalystUser(userOrgId);

  // **COLLAPSIBLE FLAGS **
  const [isPreconditionsCollapsed, setIsPreconditionsCollapsed] =
    useState(true); // Default: collapsed
  const [isCredentialsCollapsed, setIsCredentialsCollapsed] = useState(true); // Default: collapsed
  const [isStepsCollapsed, setIsStepsCollapsed] = useState(!isQaiUser); // Default: collapsed for non-QAI, uncollapsed for QAI internal
  const [isScenariosCollapsed, setIsScenariosCollapsed] = useState(true); // Default: collapsed
  const [isMirroredTestCasesCollapsed, setIsMirroredTestCasesCollapsed] =
    useState(true); // Default collapsed

  const [isPreconCredCollapsed, setIsPreconCredCollapsed] = useState(true);

  const [localDescription, setLocalDescription] = useState(
    testCase.test_case_description || "",
  );

  const [localPreconditionsText, setLocalPreconditionsText] = useState(
    (testCase.preconditions || []).join("\n"),
  );

  // Check if test case has mirrored test cases
  const hasLinkedTestCases =
    testCase.mirrored_test_cases && testCase.mirrored_test_cases.length > 0;

  // Update the description when testCase changes
  useEffect(() => {
    setLocalDescription(testCase.test_case_description || "");
  }, [testCase.test_case_description]);

  useEffect(() => {
    setLocalPreconditionsText((testCase.preconditions || []).join("\n"));
  }, [testCase.preconditions]);

  // Fetch credentials when component mounts if product is available
  useEffect(() => {
    if (productSwitcher.product_id) {
      dispatch(fetchCredentials(productSwitcher.product_id));
    }
  }, [productSwitcher.product_id, dispatch]);

  // Modified handleFieldUpdate to match SaveTestCaseFunction
  const handleFieldUpdate: SaveTestCaseFunction = async (
    updateData: Partial<testCaseSchema>,
  ) => {
    const success = await onSaveTestCase(updateData);
    if (success) {
      toast.success("Updated successfully");
    }
    return success;
  };

  const handleCredentialChange = async (credentialId: string) => {
    const existingCredentials = testCase.credentials || [];
    const newCredentials = existingCredentials.includes(credentialId)
      ? existingCredentials.filter((id) => id !== credentialId)
      : [...existingCredentials, credentialId];

    await handleFieldUpdate({ credentials: newCredentials });
  };

  const handleCredentialRemove = async (credentialId: string) => {
    const existingCredentials = testCase.credentials || [];
    const newCredentials = existingCredentials.filter(
      (id) => id !== credentialId,
    );
    await handleFieldUpdate({ credentials: newCredentials });
  };

  const handlePreconditionTestCaseChange = async (value: string) => {
    await handleFieldUpdate({ precondition_test_case_id: value });
  };

  const handleScenariosUpdate = async (updatedTestCase: testCaseSchema) => {
    await handleFieldUpdate({ scenarios: updatedTestCase.scenarios });
  };

  const handleCredentialsToggle = () => {
    const newState = !isCredentialsCollapsed;
    setIsCredentialsCollapsed(newState);

    // Fetch credentials when section is opened
    if (!newState && productSwitcher.product_id) {
      dispatch(fetchCredentials(productSwitcher.product_id));
    }
  };

  const handleHeaderTestCaseUpdate = async (updated: testCaseSchema) => {
    if (!onTestCaseUpdate) return true;
    return await onTestCaseUpdate(updated);
  };

  const ScenariosSection = () => (
    <div className="space-y-4">
      <button
        onClick={() => setIsScenariosCollapsed(!isScenariosCollapsed)}
        className="flex w-full items-center justify-between py-2 text-lg font-bold hover:text-purple-600 transition-colors"
      >
        <span>Scenarios</span>
        <ChevronDown
          className={`h-5 w-5 transition-transform ${!isScenariosCollapsed && "rotate-180"}`}
        />
      </button>

      {!isScenariosCollapsed && (
        <div className="space-y-3">
          <Scenarios
            input={testCase}
            setInput={handleScenariosUpdate}
            readOnly={false}
          />
        </div>
      )}
    </div>
  );

  const MirroredSection = () =>
    isQaiUser ? (
      <div className="space-y-4">
        <button
          onClick={() =>
            setIsMirroredTestCasesCollapsed(!isMirroredTestCasesCollapsed)
          }
          className="flex w-full items-center justify-between py-2 text-lg font-bold hover:text-purple-600 transition-colors"
        >
          <span>Mirrored Test Case(s)</span>
          <ChevronDown
            className={`h-5 w-5 transition-transform ${!isMirroredTestCasesCollapsed && "rotate-180"}`}
          />
        </button>

        {!isMirroredTestCasesCollapsed && (
          <div className="space-y-3">
            <TCMirroredTestCases
              testCase={testCase}
              isEditing={canEditMirrored}
              onSaveTestCase={handleFieldUpdate}
              isLoading={isLoading.status}
              isQaiUser={true}
            />
          </div>
        )}
      </div>
    ) : null;

  return (
    <div className="space-y-6">
      {/* Warning for linked test cases - only for QAI users */}
      {isQaiUser && hasLinkedTestCases && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-sm font-medium text-amber-800 mb-1">
              Linked Test Case
            </h4>
            <p className="text-sm text-amber-700">
              This test case is mirrored by{" "}
              {testCase.mirrored_test_cases?.length} other test case(s). Changes
              made here will also be reflected in the linked test cases.
            </p>
          </div>
        </div>
      )}

      {/* Criticality Section */}
      {showCriticality && (
        <div className="space-y-3">
          <h3 className="text-lg font-bold">Criticality</h3>
          <div className="flex items-center">
            <CriticalitySelect
              value={testCase.criticality}
              onValueChange={onCriticalityChange}
              disabled={isLoading.status}
            />
          </div>
        </div>
      )}

      {/* Full Description Section */}
      {showDescription && (
        <div className="space-y-3">
          <h3 className="text-lg font-bold">Description</h3>
          <div className="min-h-[100px] w-full border border-gray-200 rounded-xl p-3 bg-white">
            <Textarea
              value={localDescription}
              onChange={(e) => {
                setLocalDescription(e.target.value);
              }}
              onBlur={async (e) => {
                // Save only when user clicks outside
                const value = e.target.value;
                if (value !== testCase.test_case_description) {
                  await handleFieldUpdate({ test_case_description: value });
                }
              }}
              placeholder="Test case description..."
              disabled={isLoading.status}
              className={`min-h-[100px] w-full border-0 p-0 focus:ring-0 resize-none bg-transparent`}
              style={{
                height: "auto",
                minHeight: "100px",
              }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = "auto";
                target.style.height = `${Math.max(100, target.scrollHeight)}px`;
              }}
            />
          </div>
        </div>
      )}

      {/* Border */}
      {showDescription && <hr className="border-gray-300" />}

      {viewerLayout ? (
        <>
          {renderTopSections && (
            <>
              <div className="space-y-3">
                <h3 className="text-lg font-bold">Feature</h3>
                <div className="w-full max-w-[420px]">
                  <TCHeader
                    testCase={testCase}
                    features={features}
                    onClose={() => {}}
                    onCopy={() => {}}
                    onDelete={() => {}}
                    onCriticalityChange={async () => {}}
                    onStatusChange={async () => {}}
                    onTestCaseUpdate={handleHeaderTestCaseUpdate}
                    isLoading={{
                      status: isLoading.status,
                      action: isLoading.action ?? null,
                    }}
                    isStatusLoading={false}
                    showFlowViewer={() => {}}
                    isBrowserDroid={false}
                    variant="minimal"
                    showTitle={false}
                    showFeatureSelector={true}
                  />
                </div>
              </div>

              <hr className="border-gray-300" />
            </>
          )}

          {renderTopSections && (
            <div className="space-y-4">
              <button
                onClick={() => {
                  const newState = !isPreconCredCollapsed;
                  setIsPreconCredCollapsed(newState);
                  if (!newState && productSwitcher.product_id) {
                    dispatch(fetchCredentials(productSwitcher.product_id));
                  }
                }}
                className="flex w-full items-center justify-between py-2 text-lg font-bold hover:text-purple-600 transition-colors"
              >
                <span>Preconditions & Credentials</span>
                <ChevronDown
                  className={`h-5 w-5 transition-transform ${!isPreconCredCollapsed && "rotate-180"}`}
                />
              </button>

              {!isPreconCredCollapsed && (
                <div className="space-y-4">
                  {/* Precondition Test Case */}
                  <div className="space-y-3">
                    <div className="text-base font-semibold">
                      Precondition Test Case
                    </div>
                    <PreconditionTestCase
                      testCase={testCase}
                      allTestCases={allTestCases}
                      onPreconditionTestCaseChange={
                        handlePreconditionTestCaseChange
                      }
                      isEditing={canEditPreconditionTestCase}
                      isLoading={isLoading.status}
                      isCollapsible={false}
                    />
                  </div>

                  {/* Preconditions (always visible inside group) */}
                  <div className="space-y-3">
                    <div className="text-base font-semibold">Preconditions</div>
                    <div className="min-h-[80px] w-full border border-gray-200 rounded-xl p-3 bg-white">
                      <Textarea
                        value={localPreconditionsText}
                        onChange={(e) =>
                          setLocalPreconditionsText(e.target.value)
                        }
                        onBlur={async (e) => {
                          if (!canEditPreconditions || isLoading.status) return;
                          const lines = e.target.value
                            .split("\n")
                            .map((l) => l.trim())
                            .filter((l) => l.length > 0);
                          await handleFieldUpdate({ preconditions: lines });
                        }}
                        placeholder="Add one precondition per line..."
                        disabled={isLoading.status || !canEditPreconditions}
                        className="min-h-[80px] w-full border-0 p-0 focus:ring-0 resize-none bg-transparent"
                        onInput={(e) => {
                          const target = e.target as HTMLTextAreaElement;
                          target.style.height = "auto";
                          target.style.height = `${Math.max(80, target.scrollHeight)}px`;
                        }}
                      />
                    </div>
                  </div>

                  {/* Credentials (always visible inside group) */}
                  <div className="space-y-3">
                    <div className="text-base font-semibold">Credentials</div>
                    <TestCaseCredentials
                      productId={productSwitcher.product_id}
                      credentialIds={testCase?.credentials}
                      testCaseId={testCase.test_case_id}
                      isEditing={canEditCredentials}
                      isSaving={isLoading.status}
                      onCredentialChange={handleCredentialChange}
                      onCredentialRemove={handleCredentialRemove}
                      showAddCredentials={canEditCredentials}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          {/* Precondition Test Case Section */}
          <PreconditionTestCase
            testCase={testCase}
            allTestCases={allTestCases}
            onPreconditionTestCaseChange={handlePreconditionTestCaseChange}
            isEditing={true}
            isLoading={isLoading.status}
          />

          {/* Border */}
          <hr className="border-gray-300" />

          {/* Preconditions Section */}
          <div>
            <CollapsiblePreconditions
              preconditions={testCase.preconditions || []}
              isCollapsed={isPreconditionsCollapsed}
              onToggle={() =>
                setIsPreconditionsCollapsed(!isPreconditionsCollapsed)
              }
              onSave={
                canEditPreconditions
                  ? async (value) => {
                      const preconditionsArray = value
                        .split("\n")
                        .filter((p) => p.trim() !== "");
                      await handleFieldUpdate({
                        preconditions: preconditionsArray,
                      });
                    }
                  : undefined
              }
              disabled={isLoading.status || !canEditPreconditions}
            />
          </div>

          {/* Border */}
          <hr className="border-gray-300" />

          {/* Credentials Section */}
          <div className="space-y-4">
            <button
              onClick={handleCredentialsToggle}
              className="flex w-full items-center justify-between py-2 text-lg font-bold hover:text-purple-600 transition-colors"
            >
              <span>Credentials</span>
              <ChevronDown
                className={`h-5 w-5 transition-transform ${!isCredentialsCollapsed && "rotate-180"}`}
              />
            </button>

            {!isCredentialsCollapsed && (
              <div className="space-y-3">
                <TestCaseCredentials
                  productId={productSwitcher.product_id}
                  credentialIds={testCase?.credentials}
                  testCaseId={testCase.test_case_id}
                  isEditing={true}
                  isSaving={isLoading.status}
                  onCredentialChange={handleCredentialChange}
                  onCredentialRemove={handleCredentialRemove}
                />
              </div>
            )}
          </div>

          {/* Border */}
          <hr className="border-gray-300" />
        </>
      )}

      {/* Border + Steps Section */}
      {showSteps && (
        <>
          <div>
            <CollapsibleSteps
              steps={testCase.test_case_steps || []}
              isCollapsed={isStepsCollapsed}
              onToggle={() => setIsStepsCollapsed(!isStepsCollapsed)}
              onSave={async (steps) => {
                await handleFieldUpdate({ test_case_steps: steps });
              }}
              disabled={isLoading.status}
              readOnly={false}
              isQaiUser={true}
            />
          </div>
          <hr className="border-gray-300" />
        </>
      )}

      {viewerLayout && renderBottomSections ? (
        <>
          {/* Scenarios Section (viewer: below steps) */}
          <ScenariosSection />

          {/* Border */}
          <hr className="border-gray-300" />

          {/* Mirrored Test Cases Section (viewer: bottom) */}
          <MirroredSection />
        </>
      ) : !viewerLayout ? (
        <>
          {/* Mirrored Test Cases Section (default position) */}
          <>
            <MirroredSection />

            {/* Border */}
            <hr className="border-gray-300" />
          </>

          {/* Scenarios Section (default position) */}
          <ScenariosSection />
        </>
      ) : null}
    </div>
  );
}
