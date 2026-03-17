"use client";

import { useState } from "react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { TestCaseStep } from "@/lib/types";

interface EditableStepsProps {
  steps: TestCaseStep[];
  isCollapsed: boolean;
  onToggle: () => void;
  onSave?: (steps: TestCaseStep[]) => Promise<void>;
  disabled?: boolean;
}

export function EditableSteps({
  steps,
  isCollapsed,
  onToggle,
  onSave,
  disabled = false,
}: EditableStepsProps) {
  const [editingSteps, setEditingSteps] = useState<TestCaseStep[]>(steps);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleStartEdit = () => {
    if (disabled) return;
    setEditingSteps([...steps]);
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!onSave) return;

    setIsSaving(true);
    try {
      await onSave(editingSteps);
      setIsEditing(false);
    } catch (error) {
      console.error("Error saving steps:", error);
      setEditingSteps([...steps]); // Revert on error
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEditingSteps([...steps]);
    setIsEditing(false);
  };

  const updateStep = (
    stepIndex: number,
    field: keyof TestCaseStep,
    value: string | string[],
  ) => {
    const newSteps = [...editingSteps];
    if (field === "expected_results") {
      newSteps[stepIndex] = {
        ...newSteps[stepIndex],
        [field]: Array.isArray(value) ? value : [value as string],
      };
    } else {
      newSteps[stepIndex] = {
        ...newSteps[stepIndex],
        [field]: value,
      };
    }
    setEditingSteps(newSteps);
  };

  const addStep = () => {
    const newStep: TestCaseStep = {
      test_step_id: `step_${Date.now()}`,
      step_description: "",
      expected_results: [""],
    };
    setEditingSteps([...editingSteps, newStep]);
  };

  const removeStep = (stepIndex: number) => {
    const newSteps = editingSteps.filter((_, index) => index !== stepIndex);
    setEditingSteps(newSteps);
  };

  const addExpectedResult = (stepIndex: number) => {
    const newSteps = [...editingSteps];
    newSteps[stepIndex].expected_results.push("");
    setEditingSteps(newSteps);
  };

  const updateExpectedResult = (
    stepIndex: number,
    resultIndex: number,
    value: string,
  ) => {
    const newSteps = [...editingSteps];
    newSteps[stepIndex].expected_results[resultIndex] = value;
    setEditingSteps(newSteps);
  };

  const removeExpectedResult = (stepIndex: number, resultIndex: number) => {
    const newSteps = [...editingSteps];
    newSteps[stepIndex].expected_results = newSteps[
      stepIndex
    ].expected_results.filter((_, index) => index !== resultIndex);
    setEditingSteps(newSteps);
  };

  const renderExpectedResults = (step: TestCaseStep, stepIndex: number) => {
    return (
      <div className="pl-6 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Expected Results:</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => addExpectedResult(stepIndex)}
            className="text-purple-600 hover:text-purple-700"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {step.expected_results.map((result, resultIndex) => (
          <div key={resultIndex} className="flex items-start gap-2">
            <span className="text-sm mt-2">•</span>
            <Textarea
              value={result}
              onChange={(e) =>
                updateExpectedResult(stepIndex, resultIndex, e.target.value)
              }
              placeholder="Enter expected result..."
              className="min-h-[40px] flex-1 border border-gray-200 rounded-md p-2 focus:ring-1 focus:ring-purple-500"
            />
            {step.expected_results.length > 1 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeExpectedResult(stepIndex, resultIndex)}
                className="text-red-500 hover:text-red-700"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        ))}
      </div>
    );
  };

  const renderEditingStep = (step: TestCaseStep, stepIndex: number) => {
    return (
      <div
        key={step.test_step_id || stepIndex}
        className="space-y-3 p-3 border border-gray-100 rounded"
      >
        <div className="flex items-start gap-2">
          <span className="font-medium text-sm mt-2">Step {stepIndex + 1}:</span>
          <div className="flex-1">
            <Textarea
              value={step.step_description}
              onChange={(e) =>
                updateStep(stepIndex, "step_description", e.target.value)
              }
              placeholder="Enter step description..."
              className="min-h-[60px] w-full border border-gray-200 rounded-md p-2 focus:ring-1 focus:ring-purple-500"
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => removeStep(stepIndex)}
            className="text-red-500 hover:text-red-700"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        {renderExpectedResults(step, stepIndex)}
      </div>
    );
  };

  const renderEditingMode = () => {
    return (
      <div className="space-y-4">
        {editingSteps.map((step, stepIndex) => renderEditingStep(step, stepIndex))}
        <div className="flex justify-between items-center pt-3">
          <Button
            variant="ghost"
            onClick={addStep}
            className="text-purple-600 hover:text-purple-700"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Step
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancel}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              size="sm"
              className="bg-purple-600 hover:bg-purple-700 text-white"
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  const renderViewMode = () => {
    return (
      <div
        onClick={handleStartEdit}
        className={`cursor-${disabled ? "default" : "pointer"} hover:${disabled ? "" : "bg-gray-50"} transition-colors rounded p-2`}
      >
        {steps.length > 0 ? (
          <div className="space-y-3">
            {steps.map((step, stepIndex) => (
              <div key={step.test_step_id || stepIndex} className="space-y-2">
                <div className="font-medium text-gray-900">
                  Step {stepIndex + 1}: {step.step_description}
                </div>
                <div className="space-y-1 pl-4">
                  {step.expected_results.map((result, resultIndex) => (
                    <div
                      key={`${step.test_step_id}-result-${resultIndex}`}
                      className="text-gray-700 text-sm"
                    >
                      • {result}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <span className="text-gray-500 italic">No steps available</span>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
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
        <div className="pl-4">
          <div className="min-h-[80px] w-full border border-gray-200 rounded-md p-3 bg-white">
            {isEditing ? renderEditingMode() : renderViewMode()}
          </div>
        </div>
      )}
    </div>
  );
}
