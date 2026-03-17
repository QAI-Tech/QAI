"use client";

import type React from "react";
import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Edit, Play, Trash2, Plus, Pencil } from "lucide-react";
import { TestCaseStepStatus } from "@/lib/types";
import { StepAnnotationField } from "./step-annotation-field";

export interface ViewerStep {
  id: number;
  description: string;
  expectedResults: string[];
  status?: TestCaseStepStatus;
  type?: string;
  originalIndex?: number;
}

export interface StepAnnotation {
  id: string;
  timestamp: number;
  text: string;
}

interface TestCaseStepsViewerProps {
  steps: ViewerStep[];
  currentStepIndex: number;
  onStepClick: (index: number) => void;
  onStepStatusChange?: (stepIndex: number, status: TestCaseStepStatus) => void;
  disabled?: boolean;
  showCheckboxes?: boolean;
  readOnlyCheckboxes?: boolean; 
  className?: string;
  onStepAnnotate?: (stepIndex: number) => void;
  stepAnnotations?: Record<number, StepAnnotation[]>;
  onAnnotationPlay?: (annotationId: string) => void;
  onAnnotationDelete?: (annotationId: string) => void;
  onAdhocStepSave?: (stepIndex: number, stepDescription: string) => Promise<void>;
  onAdhocStepEdit?: (stepIndex: number, stepDescription: string) => Promise<void>;
  onAdhocStepDelete?: (stepIndex: number) => void | Promise<void>;
  isAdhocStepLoading?: boolean;
  showAdhocSteps?: boolean;
  canAddAdhocSteps?: boolean;
  disableAdhocSteps?: boolean;
}

export function TestCaseStepsViewer({
  steps,
  currentStepIndex,
  onStepClick,
  onStepStatusChange,
  disabled = false,
  showCheckboxes = false,
  readOnlyCheckboxes = false,
  className = "",
  onStepAnnotate,
  stepAnnotations = {},
  onAnnotationPlay,
  onAnnotationDelete,
  onAdhocStepSave,
  onAdhocStepEdit,
  onAdhocStepDelete,
  isAdhocStepLoading = false,
  showAdhocSteps = true,
  canAddAdhocSteps = false,
  disableAdhocSteps = false,
}: TestCaseStepsViewerProps) {
  const [editingAnnotationStep, setEditingAnnotationStep] = useState<number | null>(null);
  const [insertionIndex, setInsertionIndex] = useState<number | null>(null);

  const handleCheckboxChange = (stepIndex: number, checked: boolean) => {
    if (disabled || !onStepStatusChange) return;
    
    const newStatus = checked 
      ? TestCaseStepStatus.COMPLETE 
      : TestCaseStepStatus.INCOMPLETE;
    
    onStepStatusChange(stepIndex, newStatus);
  };

  const handleStartInsertion = (stepIndex: number) => {
    setInsertionIndex(stepIndex);
  };

  const handleStartEditAdhoc = (stepIndex: number) => {
    setEditingAnnotationStep(stepIndex);
  };

  const handleAdhocStepSave = async (stepIndex: number, stepDescription: string) => {
    if (onAdhocStepSave) {
      await onAdhocStepSave(stepIndex, stepDescription);
    }
    setEditingAnnotationStep(null);
    setInsertionIndex(null);
  };

  const handleAdhocStepEdit = async (stepIndex: number, stepDescription: string) => {
    if (onAdhocStepEdit) {
      await onAdhocStepEdit(stepIndex, stepDescription);
      setEditingAnnotationStep(null);
    }
  };

  const handleAdhocStepDelete = async (stepIndex: number) => {
    if (onAdhocStepDelete) {
      await onAdhocStepDelete(stepIndex);
    }
  };

  const handleAnnotationCancel = () => {
    setEditingAnnotationStep(null);
    setInsertionIndex(null);
  };


  return (
    <div className={`space-y-4 ${className}`}>
      <h3 className="text-lg font-bold">Steps</h3>

      {canAddAdhocSteps && (
        <div className="relative group/add-annotation-start pointer-events-auto">
          <div className="absolute inset-x-4 top-1/2 h-px border-t border-dashed border-gray-300 opacity-0 group-hover/add-annotation-start:opacity-100 transition-opacity duration-200" />
          <div className="flex items-center justify-center h-4">
            <Button
              variant="ghost"
              size="sm"
              className="opacity-0 group-hover/add-annotation-start:opacity-100 transition-opacity duration-200 bg-white border border-gray-300 hover:bg-gray-50 hover:border-gray-400 rounded-full h-6 w-6 p-0 z-10"
              onClick={(e) => {
                e.stopPropagation();
                handleStartInsertion(-1);
              }}
              disabled={disableAdhocSteps}
              title="Add adhoc step before first step"
            >
              <Plus size={12} className="text-gray-600" />
            </Button>
          </div>
        </div>
      )}


      {insertionIndex === -1 && canAddAdhocSteps && (
        <div className="mt-4">
          <StepAnnotationField
            value="Additional Step"
            onSave={(stepDescription) => handleAdhocStepSave(-1, stepDescription)}
            onCancel={handleAnnotationCancel}
            placeholder="Add adhoc step description..."
            disabled={disableAdhocSteps}
            minHeight="min-h-[60px]"
          />
        </div>
      )}

      {steps.map((s, idx) => {
        if (!showAdhocSteps && s.type === "ADHOC_STEP") {
          return null;
        }

        const annotations = stepAnnotations[s.id] || [];
        const isEditingAnnotation = editingAnnotationStep === idx;
        return (
          <div key={s.id} className="relative">
              <div
                className={`p-4 rounded-xl border transition-all duration-200 ${
                  s.type === "ADHOC_STEP"
                    ? "bg-orange-25 border-purple-300 cursor-default"
                    : s.id === currentStepIndex + 1
                      ? "bg-purple-50 border-purple-200 cursor-pointer"
                      : "bg-white hover:bg-gray-50 cursor-pointer"
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (s.type !== "ADHOC_STEP" && !isEditingAnnotation) {
                    onStepClick(idx);
                  }
                }}
              >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="mb-2 flex items-center justify-between">
                  <h4
                    className={`font-semibold ${
                      s.type === "ADHOC_STEP"
                        ? "text-orange-900"
                        : s.id === currentStepIndex + 1 ? "text-purple-700" : "text-gray-900"
                    }`}
                  >
                    {s.type === "ADHOC_STEP" ? "Adhoc Step" : `Step ${s.id}`}
                    {showCheckboxes && readOnlyCheckboxes && s.type !== "ADHOC_STEP" && (
                      <div className="inline-flex items-center ml-2">
                        {s.status === TestCaseStepStatus.COMPLETE ? (
                          <div className="h-5 w-5 rounded-full bg-green-100 border-2 border-green-500 flex items-center justify-center">
                            <svg
                              className="h-3 w-3 text-green-600"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          </div>
                        ) : (
                          <span className="text-yellow-600 text-sm ml-1">⚠️</span>
                        )}
                      </div>
                    )}
                  </h4>
                  
                  <div className="flex items-center gap-2">
                    {showCheckboxes && !readOnlyCheckboxes && s.type !== "ADHOC_STEP" && (
                      <div className="p-2 -m-2">
                        <Checkbox
                          checked={s.status === TestCaseStepStatus.COMPLETE}
                          onCheckedChange={(checked) => {
                            if (typeof checked === "boolean") {
                              handleCheckboxChange(idx, checked);
                            }
                          }}
                          disabled={disabled}
                          className="h-5 w-5 border-gray-300 data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    )}

                    {annotations.length > 0 && (
                      <div className="flex items-center gap-1">
                        {annotations.slice(0, 1).map((annotation) => (
                          <div
                            key={annotation.id}
                            className="flex items-center gap-1 bg-blue-50 border border-blue-200 rounded px-2 py-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <span className="text-xs text-blue-700 font-medium">
                              {Math.floor(annotation.timestamp / 60)}:
                              {Math.floor(annotation.timestamp % 60)
                                .toString()
                                .padStart(2, "0")}
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onAnnotationPlay?.(annotation.id)}
                              className="h-5 w-5 p-0 hover:bg-green-100"
                            >
                              <Play size={12} className="text-green-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onAnnotationDelete?.(annotation.id)}
                              className="h-5 w-5 p-0 hover:bg-red-100"
                            >
                              <Trash2 size={12} className="text-red-600" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}

                    {s.type === "ADHOC_STEP" && onAdhocStepEdit && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartEditAdhoc(idx);
                        }}
                        disabled={isAdhocStepLoading}
                        className="h-8 w-8 p-0 hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        title={isAdhocStepLoading ? "Saving..." : "Edit adhoc step"}
                      >
                        <Pencil size={15} className="text-blue-600" />
                      </Button>
                    )}

                    {s.type === "ADHOC_STEP" && onAdhocStepDelete && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAdhocStepDelete(idx);
                        }}
                        disabled={isAdhocStepLoading}
                        className="h-8 w-8 p-0 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        title={isAdhocStepLoading ? "Deleting..." : "Delete adhoc step"}
                      >
                        <Trash2 size={15} className="text-red-600" />
                      </Button>
                    )}

                    {onStepAnnotate && annotations.length === 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onStepAnnotate(idx);
                        }}
                        disabled={disabled}
                        className="h-8 w-8 p-0 hover:bg-purple-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        title={disabled ? "No video available for annotation" : `Add annotation for ${s.type === "ADHOC_STEP" ? "Adhoc Step" : `Step ${s.id}`}`}
                      >
                        <Edit size={25} className="text-purple-600" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
            {s.type === "ADHOC_STEP" && editingAnnotationStep === idx ? (
              <div className="mt-4">
                <StepAnnotationField
                  value={s.type === "ADHOC_STEP" ? s.description : "Additional Step"}
                  onSave={async (stepDescription) => {
                    if (s.type === "ADHOC_STEP" && onAdhocStepEdit) {
                      await handleAdhocStepEdit(idx, stepDescription);
                    } else if (onAdhocStepSave) {
                      await handleAdhocStepSave(idx, stepDescription);
                    }
                  }}
                  onCancel={handleAnnotationCancel}
                  placeholder="Add adhoc step description..."
                  disabled={isAdhocStepLoading}
                  minHeight="min-h-[60px]"
                />
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-700 mt-2">{s.description}</p>
                {s.expectedResults?.length > 0 && (
                  <div className="mt-3">
                    <div className="text-sm font-medium text-gray-900 mb-1">
                      Expected Results
                    </div>
                    <ul className="space-y-1">
                      {s.expectedResults.map((er, eri) => (
                        <li
                          key={eri}
                          className="text-sm text-gray-600 list-disc list-inside"
                          style={{
                            color: idx === currentStepIndex ? "#8b5cf6" : "#6b7280",
                          }}
                        >
                          <span className="text-gray-600 ml-1">{er}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
            </div>

            {canAddAdhocSteps && insertionIndex === idx && (
              <div className="mt-4">
                <StepAnnotationField
                  value="Additional Step"
                  onSave={(stepDescription) => handleAdhocStepSave(idx, stepDescription)}
                  onCancel={handleAnnotationCancel}
                  placeholder="Add adhoc step description..."
                  disabled={disableAdhocSteps}
                  minHeight="min-h-[60px]"
                />
              </div>
            )}

            {canAddAdhocSteps && (
              <div className="absolute left-0 right-0 -bottom-4 h-4 group/add-annotation pointer-events-auto">
                <div className="absolute inset-x-4 top-1/2 h-px border-t border-dashed border-gray-300 opacity-0 group-hover/add-annotation:opacity-100 transition-opacity duration-200" />
                <div className="flex items-center justify-center h-full">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="opacity-0 group-hover/add-annotation:opacity-100 transition-opacity duration-200 bg-white border border-gray-300 hover:bg-gray-50 hover:border-gray-400 rounded-full h-6 w-6 p-0 z-10"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStartInsertion(idx);
                      }}
                      disabled={disableAdhocSteps}
                      title="Add adhoc step"
                    >
                      <Plus size={12} className="text-gray-600" />
                    </Button>
                </div>
              </div>
            )}
          </div>
        );
      })}

    </div>
  );
}