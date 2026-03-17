"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import type React from "react";

import { ChevronDown, Plus, Trash2, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TestCaseStep } from "@/lib/types";
import type { CollapsibleStepsProps } from "@/lib/types";
import { StepMenu } from "@/components/ui/step-menu";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import * as Sentry from "@sentry/nextjs";

export type StepValidationError = {
  desc?: boolean;
  expectedResults?: boolean[];
  method?: boolean;
  url?: boolean;
  body?: boolean;
};

export function CollapsibleSteps({
  steps,
  isCollapsed,
  onToggle,
  onSave,
  disabled = false,
  readOnly = true,
}: CollapsibleStepsProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editingSteps, setEditingSteps] = useState<TestCaseStep[]>(steps);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [draggedStepIndex, setDraggedStepIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLTextAreaElement>(null);
  const [isOverlayOpen, setIsOverlayOpen] = useState(false);
  const [apiResponse, setApiResponse] = useState<{ [stepIndex: number]: string | null }>({});
  const [lastTriggeredStep, setLastTriggeredStep] = useState<number | null>(null);
  const [apiLoading, setApiLoading] = useState<{ [stepIndex: number]: boolean }>({});
  const [validationErrors, setValidationErrors] = useState<Record<number, StepValidationError>>({});

  const clearValidationErrorsForStep = (index: number) => {
    setValidationErrors((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  };

  // Update editing steps when props change
  useEffect(() => {
    setEditingSteps(steps);
    setHasChanges(false);
  }, [steps]);

  const validateSteps = useCallback((candidate: TestCaseStep[]) => {
    const errors: Record<number, StepValidationError> = {};
  
    candidate.forEach((step, index) => {
      const stepErrors: StepValidationError = {};
  
      if (step.type === "API_CALL") {
        const method = ((step.http_method || "GET").trim());
        const url = (step.url || "").trim();
        const upper = method.toUpperCase();
  
        if (!url) stepErrors.url = true;
        if (["POST", "PUT", "PATCH"].includes(upper)) {
          if ((step.request_body || "").trim() === "") stepErrors.body = true;
        }
      } else {
        const descEmpty = (step.step_description || "").trim() === "";
        const expected = step.expected_results || [];
        const expectedEmptyFlags = expected.map((r) => (r || "").trim() === "");
  
        if (descEmpty) stepErrors.desc = true;
        if (expected.length === 0 || expectedEmptyFlags.some(Boolean)) {
          stepErrors.expectedResults = expected.length ? expectedEmptyFlags : [true];
        }
      }
  
      if (Object.keys(stepErrors).length > 0) {
        errors[index] = stepErrors;
      }
    });
  
    return errors;
  }, []);
  

  const handleStartEdit = () => {
    if (disabled || !onSave || readOnly) return;
    const normalized = steps.map((s) => (
      s.type === "API_CALL"
        ? { ...s, http_method: (s.http_method && s.http_method.trim()) || "GET" }
        : s
    ));
    setEditingSteps([...normalized]);
    setIsEditing(true);
    setHasChanges(false);
    setValidationErrors({});

    // Focus on the first input field after the component updates
    setTimeout(() => {
      if (firstInputRef.current) {
        firstInputRef.current.focus();
      }
    }, 0);
  };

  const checkForChanges = useCallback((newSteps: TestCaseStep[]) => {
    const hasChanges = newSteps.length !== steps.length || newSteps.some((step, index) => {
      const originalStep = steps[index];
      if (!originalStep) return true;
      return (
        step.step_description !== originalStep.step_description ||
        step.expected_results.length !== originalStep.expected_results.length ||
        step.expected_results.some((result, resultIndex) => result !== originalStep.expected_results[resultIndex]) ||
        step.type !== originalStep.type ||
        (step.type === "API_CALL" && (
          step.http_method !== originalStep.http_method ||
          step.url !== originalStep.url ||
          step.headers !== originalStep.headers ||
          step.request_body !== originalStep.request_body
        ))
      );
    }) || steps.some((_, index) => !newSteps[index]);
    setHasChanges(hasChanges);
  }, [steps]);

  const handleSave = useCallback(async () => {
    if (!onSave || isSaving) return;

    if (!hasChanges) {
      setIsEditing(false);
      return;
    }

    const errors = validateSteps(editingSteps);
    setValidationErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast.error("Please complete required fields before saving.");
      return;
    }

    setIsSaving(true);
    try {
      await onSave(editingSteps);
      setIsEditing(false);
      setHasChanges(false);
    } catch (error) {
      console.error("Error saving steps:", error);
      setEditingSteps([...steps]); // Revert on error
    } finally {
      setIsSaving(false);
    }
  }, [onSave, isSaving, hasChanges, editingSteps, steps, validateSteps]);

  useEffect(() => {
    if (!isEditing) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (isOverlayOpen) return;
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        handleSave();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isEditing, handleSave, isOverlayOpen]);

  // Auto-save on Escape key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setEditingSteps([...steps]);
      setIsEditing(false);
      setHasChanges(false);
    }
  };

  const updateStep = (stepIndex: number, field: keyof TestCaseStep, value: string | string[]) => {
    const newSteps = [...editingSteps];
    if (field === "expected_results") {
      const newResults = Array.isArray(value) ? value : [value as string];
      newSteps[stepIndex] = {
        ...newSteps[stepIndex],
        [field]: newResults,
      };
    } else if (field === "http_method") {
      const method = (value as string)?.toUpperCase?.() || "";
      const shouldClearBody = method === "GET" || method === "DELETE";
      newSteps[stepIndex] = {
        ...newSteps[stepIndex],
        http_method: value as string,
        ...(shouldClearBody ? { request_body: "" } : {}),
      };
    } else {
      newSteps[stepIndex] = {
        ...newSteps[stepIndex],
        [field]: value,
      };
    }
    setEditingSteps(newSteps);
    checkForChanges(newSteps);

    clearValidationErrorsForStep(stepIndex);
  };

  const updateStepType = (stepIndex: number, isApiCall: boolean) => {
    const newSteps = [...editingSteps];
    newSteps[stepIndex] = isApiCall
      ? {
          ...newSteps[stepIndex],
          type: "API_CALL",
          http_method: "GET",
          url: "",
          request_body: "",
          headers: "",
        }
      : {
          ...newSteps[stepIndex],
          type: undefined,
          http_method: undefined,
          url: undefined,
          request_body: undefined,
          headers: undefined,
        };
    setEditingSteps(newSteps);
    checkForChanges(newSteps);

    clearValidationErrorsForStep(stepIndex);
  };

  const addStep = () => {
    const newStep: TestCaseStep = {
      test_step_id: `step_${Date.now()}`,
      step_description: "",
      expected_results: [""],
    };
    const newSteps = [...editingSteps, newStep];
    setEditingSteps(newSteps);
    checkForChanges(newSteps);
    setValidationErrors(validateSteps(newSteps));
  };

  const createEmptyStep = (): TestCaseStep => ({
    test_step_id: `step_${Date.now()}`,
    step_description: "",
    expected_results: [""],
  });
  
  const createApiCallStep = (): TestCaseStep => ({
    test_step_id: `api_step_${Date.now()}`,
    step_description: "",
    expected_results: [""],
    type: "API_CALL",
    http_method: "GET",
    url: "",
    request_body: "",
    headers: "",
  });

  const mutateSteps = (
    stepIndex: number,
    operation: "insertBefore" | "insertAfter" | "remove",
    ensureEditing = false,
    isApiCall = false,
  ) => {
    if (ensureEditing && !isEditing) {
      setIsEditing(true);
    }

    setEditingSteps((current) => {
      const baseSteps = isEditing ? current : steps;
      const newSteps = [...baseSteps];
      if (operation === "insertBefore") {
        newSteps.splice(stepIndex, 0, isApiCall ? createApiCallStep() : createEmptyStep());
      } else if (operation === "insertAfter") {
        newSteps.splice(stepIndex + 1, 0, isApiCall ? createApiCallStep() : createEmptyStep());
      } else if (operation === "remove") {
        newSteps.splice(stepIndex, 1);
      }
      checkForChanges(newSteps);
      setValidationErrors(validateSteps(newSteps));
      return newSteps;
    });
  };

  const updateExpectedResult = (stepIndex: number, resultIndex: number, value: string) => {
    const newSteps = [...editingSteps];
    const newResults = [...newSteps[stepIndex].expected_results];
    newResults[resultIndex] = value;
    newSteps[stepIndex] = {
      ...newSteps[stepIndex],
      expected_results: newResults,
    };
    setEditingSteps(newSteps);
    checkForChanges(newSteps);
  };

  const addExpectedResult = (stepIndex: number) => {
    const newSteps = [...editingSteps];
    const newResults = [...newSteps[stepIndex].expected_results, ""];
    newSteps[stepIndex] = {
      ...newSteps[stepIndex],
      expected_results: newResults,
    };
    setEditingSteps(newSteps);
    checkForChanges(newSteps);
    setValidationErrors(validateSteps(newSteps));
  };

  const removeExpectedResult = useCallback((stepIndex: number, resultIndex: number) => {
    const newSteps = editingSteps.map((step, idx) => {
      if (idx === stepIndex) {
        return {
          ...step,
          expected_results: step.expected_results.filter((_, index) => index !== resultIndex)
        };
      }
      return step;
    });
    setEditingSteps(newSteps);
    checkForChanges(newSteps);
    setValidationErrors(validateSteps(newSteps));
  }, [editingSteps, checkForChanges, validateSteps]);


  const addStepBefore = (stepIndex: number) => mutateSteps(stepIndex, "insertBefore", false, false);
  const addStepAfter = (stepIndex: number) => mutateSteps(stepIndex, "insertAfter", false, false);
  const removeStep = (stepIndex: number) => mutateSteps(stepIndex, "remove", false, false);

  const beginEditAndAddBefore = (stepIndex: number) => mutateSteps(stepIndex, "insertBefore", true, false);
  const beginEditAndAddAfter = (stepIndex: number) => mutateSteps(stepIndex, "insertAfter", true, false);
  const beginEditAndRemove = (stepIndex: number) => mutateSteps(stepIndex, "remove", true, false);

  const handleStepDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.effectAllowed = 'move';
    setDraggedStepIndex(index);
  };

  const handleStepDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTargetIndex(index);
  };

  const handleStepDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDropTargetIndex(null);
  };

  const handleStepDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedStepIndex === null || draggedStepIndex === dropIndex) return;

    const newSteps = [...editingSteps];
    const [draggedStep] = newSteps.splice(draggedStepIndex, 1);
    newSteps.splice(dropIndex, 0, draggedStep);

    setEditingSteps(newSteps);
    checkForChanges(newSteps);
    setDraggedStepIndex(null);
    setDropTargetIndex(null);
  };

  const handleStepDragEnd = (e: React.DragEvent) => {
    e.preventDefault();
    setDraggedStepIndex(null);
    setDropTargetIndex(null);
  };

  const handleApiTrigger = async (stepIndex: number) => {
    try {
      setApiLoading((prev) => ({ ...prev, [stepIndex]: true }));
      const step = editingSteps[stepIndex];
      if (!step || step.type !== "API_CALL") {
        setApiLoading((prev) => ({ ...prev, [stepIndex]: false }));
        console.log("Invalid step or step is not an API call");
        return;
      }

      let parsedBody = {};
      let parsedHeaders = {};
      try {
        parsedBody = step.request_body ? JSON.parse(step.request_body) : {};
      } catch {
        setApiLoading((prev) => ({ ...prev, [stepIndex]: false }));
        toast.error("Request Body must be valid JSON");
        return;
      }
      try {
        parsedHeaders = step.headers ? JSON.parse(step.headers) : {};
      } catch {
        setApiLoading((prev) => ({ ...prev, [stepIndex]: false }));
        toast.error("Headers must be valid JSON");
        return;
      }
      const requestBody = {
        body: parsedBody,
        headers: parsedHeaders,
        base_url: step.url || "",
        method: step.http_method || "GET"
      };

      setApiResponse((prev) => ({ ...prev, [stepIndex]: null }));
      setLastTriggeredStep(stepIndex);

      const response = await fetch("/api/trigger-api-request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json();
        setApiResponse((prev) => ({ ...prev, [stepIndex]: errorData }));
        setApiLoading((prev) => ({ ...prev, [stepIndex]: false }));
        throw new Error(errorData.error || "Failed to trigger API request");
      }

      const result = await response.json();
      setApiResponse((prev) => ({ ...prev, [stepIndex]: result.result }));
      setApiLoading((prev) => ({ ...prev, [stepIndex]: false }));
      toast.success("API request triggered successfully");
    } catch (error) {
      setApiResponse((prev) => ({ ...prev, [stepIndex]:  String(error) }));
      setApiLoading((prev) => ({ ...prev, [stepIndex]: false }));
      Sentry.captureException(error, {
        level: "fatal",
        tags: { priority: "high" },
      });
      toast.error(`Failed to trigger API request`);
    }
  };

  return (
    <div className="space-y-4 pl-0">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between py-2 text-lg font-bold hover:text-purple-600 transition-colors"
      >
        <span>Steps</span>
        <ChevronDown
          className={cn(
            "h-5 w-5 transition-transform",
            !isCollapsed && "rotate-180",
          )}
        />
      </button>

      {!isCollapsed && (
        <div className="-ml-2 pl-1">
          {isEditing ? (
            <div className="min-h-[80px] w-full border border-gray-200 rounded-xl p-3 bg-white">
              <div
                ref={containerRef}
                className="space-y-4"
                onKeyDown={handleKeyDown}
                tabIndex={-1}
              >
                {editingSteps.map((step, stepIndex) => (
                  <div key={step.test_step_id || stepIndex}>
                    <div 
                      className={cn(
                        "space-y-3 p-3 border rounded cursor-grab active:cursor-grabbing relative group bg-gray-50",
                        draggedStepIndex === stepIndex ? "opacity-50 border-purple-500" : "border-gray-100",
                        dropTargetIndex === stepIndex ? "border-purple-500" : "border-gray-100",
                        validationErrors[stepIndex] && "border-red-300"
                      )}
                      draggable
                      onDragStart={(e) => handleStepDragStart(e, stepIndex)}
                      onDragOver={(e) => handleStepDragOver(e, stepIndex)}
                      onDragLeave={handleStepDragLeave}
                      onDrop={(e) => handleStepDrop(e, stepIndex)}
                      onDragEnd={handleStepDragEnd}
                    >
                      <div className="flex items-start flex-col gap-3 md:flex-row md:gap-6">
                        <div className="w-full md:flex-1">
                          <div className="flex items-center gap-2 mb-2 min-h-[32px]">
                            <GripVertical className="h-5 w-5 text-muted-foreground hover:text-foreground transition-colors" />
                            <span className="font-medium text-sm">Step {stepIndex + 1}:</span>
                            <div className="flex items-center gap-2 ml-2">
                              <Switch
                                checked={step.type === "API_CALL"}
                                onCheckedChange={(checked) => updateStepType(stepIndex, checked)}
                                disabled={isSaving}
                                id={`step-type-toggle-${stepIndex}`}
                              />
                              <label htmlFor={`step-type-toggle-${stepIndex}`} className="text-xs select-none">
                                {step.type === "API_CALL" ? "API Call" : "Step"}
                              </label>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeStep(stepIndex)}
                              className="text-red-500 hover:text-red-700 ml-auto hidden"
                              disabled={isSaving}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                          {step.type === "API_CALL" ? (
                            <div className="space-y-3">
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div>
                                  <Label className="text-xs">HTTP</Label>
                                  <Select
                                    onOpenChange={(open) => setIsOverlayOpen(open)}
                                    value={step.http_method || "GET"}
                                    onValueChange={(val) => updateStep(stepIndex, "http_method", val)}
                                    disabled={isSaving}
                                  >
                                    <SelectTrigger className={cn("mt-1", validationErrors[stepIndex]?.method && "border-red-500 ring-1 ring-red-500")}> 
                                      <SelectValue placeholder="Method" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {[
                                        "GET",
                                        "POST",
                                        "PUT",
                                        "PATCH",
                                        "DELETE",
                                      ].map((m) => (
                                        <SelectItem key={m} value={m}>{m}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="md:col-span-2">
                                  <Label className="text-xs">Headers (JSON)</Label>
                                  <Textarea
                                    className="mt-1 min-h-[60px] w-full border border-gray-200 rounded-xl p-2 focus:ring-1 focus:ring-black"
                                    value={step.headers || ""}
                                    onChange={(e) => updateStep(stepIndex, "headers", e.target.value)}
                                    placeholder='{"Authorization": "Bearer <token>"}'
                                    disabled={isSaving}
                                  />
                                </div>
                              </div>
                              <div>
                                <Label className="text-xs">URL</Label>
                                <Input
                                  className={cn("mt-1", validationErrors[stepIndex]?.url && "border-red-500 ring-1 ring-red-500")}
                                  value={step.url || ""}
                                  onChange={(e) => updateStep(stepIndex, "url", e.target.value)}
                                  placeholder="https://api.example.com/resource"
                                  disabled={isSaving}
                                />
                              </div>
                            </div>
                          ) : (
                            <Textarea
                              ref={stepIndex === 0 ? firstInputRef : null}
                              value={step.step_description}
                              onChange={(e) => updateStep(stepIndex, "step_description", e.target.value)}
                              placeholder="Enter step description..."
                              className={cn("min-h-[60px] w-full border border-gray-200 rounded-xl p-2 focus:ring-1 focus:ring-black", validationErrors[stepIndex]?.desc && "border-red-500 ring-1 ring-red-500")}
                              disabled={isSaving}
                            />
                          )}
                        </div>

                        <div className="w-full md:flex-1">
                          {step.type === "API_CALL" ? (
                            <>
                              <div className="flex items-center justify-between mb-1 min-h-[32px]">
                                <span className="text-sm font-medium">Body (POST, PUT, PATCH)</span>
                                <div className="flex items-center gap-1">
                                  <StepMenu
                                    isEditing={isEditing && !isSaving}
                                    inline
                                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                                    onDeleteStep={() => removeStep(stepIndex)}
                                    onAddStepBefore={() => addStepBefore(stepIndex)}
                                    onAddStepAfter={() => addStepAfter(stepIndex)}
                                  />
                                </div>
                              </div>
                              {((step.http_method || "").toUpperCase() === "POST" || (step.http_method || "").toUpperCase() === "PUT" || (step.http_method || "").toUpperCase() === "PATCH") && (
                                <Textarea
                                  value={step.request_body || ""}
                                  onChange={(e) => updateStep(stepIndex, "request_body", e.target.value)}
                                  placeholder='{"key": "value"}'
                                  className={cn("min-h-[100px] w-full border border-gray-200 rounded-xl p-2 focus:ring-1 focus:ring-black", validationErrors[stepIndex]?.body && "border-red-500 ring-1 ring-red-500")}
                                  disabled={isSaving}
                                />
                              )}
                            </>
                          ) : (
                            <>
                              <div className="flex items-center justify-between mb-1 min-h-[32px]">
                                <span className="text-sm font-medium">Expected Results:</span>
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => addExpectedResult(stepIndex)}
                                    className="text-purple-600 hover:text-purple-700"
                                    disabled={isSaving}
                                  >
                                    <Plus className="h-4 w-4" />
                                  </Button>
                                  <StepMenu
                                    isEditing={isEditing && !isSaving}
                                    inline
                                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                                    onDeleteStep={() => removeStep(stepIndex)}
                                    onAddStepBefore={() => addStepBefore(stepIndex)}
                                    onAddStepAfter={() => addStepAfter(stepIndex)}
                                  />
                                </div>
                              </div>
                              {step.expected_results.map((result, resultIndex) => (
                                <div key={resultIndex} className="flex items-start gap-2 mb-2">
                                  <span className="text-sm mt-2">•</span>
                                  <Textarea
                                    value={result}
                                    onChange={(e) => updateExpectedResult(stepIndex, resultIndex, e.target.value)}
                                    placeholder="Enter expected result..."
                                    className={cn("min-h-[40px] flex-1 border border-gray-200 rounded-xl p-2 focus:ring-1 focus:ring-black", (validationErrors[stepIndex]?.expectedResults || [])[resultIndex] && "border-red-500 ring-1 ring-red-500")}
                                    disabled={isSaving}
                                  />
                                  {step.expected_results.length > 1 && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => removeExpectedResult(stepIndex, resultIndex)}
                                      className="text-red-500 hover:text-red-700"
                                      disabled={isSaving}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  )}
                                </div>
                              ))}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                   
                  </div>
                ))}

<div className="flex justify-start items-center pt-3">
                  {editingSteps.length === 0 && (
                    <Button
                      variant="ghost"
                      onClick={addStep}
                      className="text-purple-600 hover:text-purple-700"
                      disabled={isSaving}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Step
                    </Button>
                  )}
                  {isSaving && <span className="ml-3 text-sm text-gray-500">Saving...</span>}
                </div>
              </div>
            </div>
          ) : (
            <div
              onClick={handleStartEdit}
              className={`cursor-${disabled || !onSave || readOnly ? "default" : "pointer"} hover:${disabled || !onSave || readOnly ? "" : "bg-gray-50"} transition-colors rounded p-2`}
            >
              {steps.length > 0 ? (
                <div className="space-y-4">
                  {steps.map((step, stepIndex) => (
                    <div
                      key={step.test_step_id || stepIndex}
                      className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm relative group"
                    >
                      {!readOnly && !disabled && (
                        <StepMenu
                          isEditing={true}
                          onDeleteStep={() => beginEditAndRemove(stepIndex)}
                          onAddStepBefore={() => beginEditAndAddBefore(stepIndex)}
                          onAddStepAfter={() => beginEditAndAddAfter(stepIndex)}
                        />
                      )}
                      <div className="space-y-3">
                        <div className="flex items-start gap-6">
                          <div className="flex-1">
                            <div className="text-gray-700 font-bold mb-2 flex items-center gap-2">
                              <span>Step {stepIndex + 1}:</span>
                              {step.type === "API_CALL" && (
                                <Button
                                  size="sm"
                                  variant="default"
                                  className="bg-purple-600 hover:bg-purple-700 text-white"
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleApiTrigger(stepIndex)
                                  }}
                                  disabled={!!apiLoading[stepIndex]}
                                >
                                  {apiLoading[stepIndex] ? (
                                    <>
                                      <svg className="animate-spin h-4 w-4 mr-2 inline-block" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
                                      Triggering...
                                    </>
                                  ) : (
                                    "Trigger"
                                  )}
                                </Button>
                              )}
                            </div>
                            {step.type === "API_CALL" ? (
                              <div className="mb-4 ml-2 space-y-2 text-sm">
                                <div><span className="font-medium">HTTP:</span> {step.http_method}</div>
                                <div><span className="font-medium">URL:</span> {step.url}</div>
                                {step.headers && (
                                  <div>
                                    <div className="font-medium">Headers:</div>
                                    <pre className="bg-gray-50 p-2 rounded border whitespace-pre-wrap break-words">{step.headers}</pre>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="text-gray-700 whitespace-pre-line mb-4 ml-2">
                                {step.step_description}
                              </div>
                            )}
                          </div>

                          {step.type !== "API_CALL" ? (
                            <div className="flex-1">
                              <div className="text-gray-700 font-bold mb-2">Expected Results:</div>
                              <div className="space-y-1">
                                {step.expected_results.map((result, resultIndex) => (
                                  <div
                                    key={`${step.test_step_id}-result-${resultIndex}`}
                                    className="text-gray-700 flex items-start gap-2"
                                  >
                                    <span className="text-gray-700 font-medium ml-2">•</span>
                                    <span className="whitespace-pre-line">{result}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            ((step.http_method || "").toUpperCase() === "POST" || (step.http_method || "").toUpperCase() === "PUT" || (step.http_method || "").toUpperCase() === "PATCH") && (
                              <div className="flex-1">
                                <div className="text-gray-700 font-bold mb-2">Body</div>
                                {step.request_body && (
                                  <pre className="bg-gray-50 p-2 rounded border whitespace-pre-wrap break-words text-sm">{step.request_body}</pre>
                                )}
                              </div>
                            )
                          )}
                        </div>
                        {step.type === "API_CALL" && lastTriggeredStep === stepIndex && apiResponse[stepIndex] && (
                          <div className="mt-2 p-2 border rounded bg-gray-50 text-xs whitespace-pre-wrap break-words">
                            <strong>Response:</strong>
                            <pre className="whitespace-pre-wrap break-words">{JSON.stringify(apiResponse[stepIndex], null, 2)}</pre>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                  <span className="text-gray-500 italic">No steps available</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
