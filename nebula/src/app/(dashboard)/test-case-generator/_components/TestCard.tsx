"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { testCaseSchema, TestCaseType } from "@/lib/types";
import { Dot, Pencil, Save, X } from "lucide-react";
import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { TestCaseFrame } from "./TestCaseFrame";
import { toast } from "sonner";
import {
  FIELD_STEP_DESCRIPTION,
  UPDATE_TEST_CASE_API_ENDPOINT,
} from "@/lib/constants";

type Props = {
  testCase: testCaseSchema;
  requestId: string;
};

// destructuring the props
const TestCard = ({ testCase, requestId }: Props) => {
  const [isEditing, setIsEditing] = useState(false);

  // updating the test case object to add request_id
  const [editedTestCase, setEditedTestCase] = useState<testCaseSchema>({
    ...testCase,
    request_id: requestId,
  });

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleCancel = () => {
    setEditedTestCase(testCase);
    setIsEditing(false);
  };
  const updateTestCase = async () => {
    try {
      const response = await fetch(UPDATE_TEST_CASE_API_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ testCase: editedTestCase }),
      });
      if (!response.ok) {
        throw new Error("Failed to update test case");
      }
      if (response.status === 401) {
        toast.error(
          "Session token expired, logging out the user to regenerate token",
        );
      }
      const result = await response.json();
      console.log("Updated test case", result);
      toast.success("Test case updated successfully");
    } catch (error) {
      toast.error("Error updating test case");
      console.error("Error updating test case:", error);
    }
  };
  const handleSave = async () => {
    console.log("Edited test case:", editedTestCase);
    try {
      await updateTestCase();
      setIsEditing(false);
    } catch (error) {
      console.log("Error while updating the test case: ", error);
    }
  };

  const updateTestCaseDescription = (testCaseDescription: string) => {
    setEditedTestCase((prev) => ({
      ...prev,
      test_case_description: testCaseDescription,
    }));
  };

  const updateTestCaseType = (testCaseType: TestCaseType) => {
    setEditedTestCase((prev) => ({ ...prev, test_case_type: testCaseType }));
  };

  const updatePrecondition = (
    preconditionIndex: number,
    newPrecondition: string,
  ) => {
    setEditedTestCase((prev) => ({
      ...prev,
      preconditions:
        prev.preconditions &&
        prev.preconditions.map((precondition, index) =>
          index === preconditionIndex ? newPrecondition : precondition,
        ),
    }));
  };

  const updateTestStep = (
    stepIndex: number,
    field: string,
    testStepvalue: string,
  ) => {
    setEditedTestCase((prev) => ({
      ...prev,
      test_case_steps: prev.test_case_steps.map((step, index) =>
        index === stepIndex ? { ...step, [field]: testStepvalue } : step,
      ),
    }));
  };

  const updateExpectedResult = (
    stepIndex: number,
    expectedResultIndex: number,
    updatedExpectedResult: string,
  ) => {
    setEditedTestCase((prev) => ({
      ...prev,
      test_case_steps: prev.test_case_steps.map((testCaseStep, index) =>
        index === stepIndex
          ? {
              ...testCaseStep,
              expected_results: testCaseStep.expected_results.map(
                (expectedResult, idx) =>
                  idx === expectedResultIndex
                    ? updatedExpectedResult
                    : expectedResult,
              ),
            }
          : testCaseStep,
      ),
    }));
  };

  return (
    <Card className="my-6 p-6 shadow-lg rounded-lg border text-primary relative">
      <div className="absolute top-4 right-4 flex gap-2">
        {isEditing ? (
          <>
            <Button variant="outline" size="icon" onClick={handleCancel}>
              <X className="h-4 w-4" />
            </Button>
            <Button variant="default" size="icon" onClick={handleSave}>
              <Save className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <Button variant="outline" size="icon" onClick={handleEdit}>
            <Pencil className="h-4 w-4" />
          </Button>
        )}
      </div>

      <CardHeader className="mb-4">
        <CardTitle>
          <div>
            <h3 className="text-lg font-semibold">Test Case Description</h3>
            {isEditing ? (
              <Textarea
                value={editedTestCase.test_case_description}
                onChange={(e) => updateTestCaseDescription(e.target.value)}
                className="mt-2"
              />
            ) : (
              <p className="mt-2 text-primary/80">
                {editedTestCase.test_case_description}
              </p>
            )}
          </div>
          {isEditing ? (
            <div className="mt-4">
              <Select
                value={editedTestCase.test_case_type}
                onValueChange={(value) =>
                  updateTestCaseType(value as TestCaseType)
                }
              >
                <SelectTrigger className="w-4/12">
                  <SelectValue>{editedTestCase.test_case_type}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.values(TestCaseType).map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <Badge variant="outline">{editedTestCase.test_case_type}</Badge>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="flex justify-between flex-col md:flex-row w-full">
          {/* Preconditions and Test Steps */}
          <div className="flex flex-col md:w-2/3 pr-4">
            {!editedTestCase.preconditions ? null : (
              <div className="mb-2">
                <h3 className="text-lg font-semibold">Preconditions</h3>
                <ul className="mt-4 space-y-4">
                  {editedTestCase.preconditions.map((precondition, index) => (
                    <li key={index} className="pl-4">
                      <div className="border-l-4 border-gray-300 pl-4">
                        <h4 className="text-md font-medium">
                          {index + 1}.{" "}
                          {isEditing ? (
                            <Input
                              value={precondition}
                              onChange={(e) =>
                                updatePrecondition(index, e.target.value)
                              }
                              className="mt-2"
                            />
                          ) : (
                            precondition
                          )}
                        </h4>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-2 space-y-2">
              <h3 className="text-lg font-semibold">Test Steps</h3>
              <ul className="mt-4 space-y-4">
                {editedTestCase.test_case_steps.map((step, stepIndex) => (
                  <li key={step.test_step_id} className="pl-4">
                    <div className="border-l-4 border-gray-300 pl-4">
                      <h4 className="text-md font-medium">
                        {stepIndex + 1}.{" "}
                        {isEditing ? (
                          <Input
                            value={step.step_description}
                            onChange={(e) =>
                              updateTestStep(
                                stepIndex,
                                FIELD_STEP_DESCRIPTION,
                                e.target.value,
                              )
                            }
                            className="mt-2"
                          />
                        ) : (
                          step.step_description
                        )}
                      </h4>
                      <ul className="mt-2 space-y-2">
                        {step.expected_results.map(
                          (expectedResult, expectedResultIndex) => (
                            <li
                              key={expectedResultIndex}
                              className="flex items-center"
                            >
                              <Dot size={32} className="mr-2 text-primary" />
                              {isEditing ? (
                                <Input
                                  value={expectedResult}
                                  onChange={(e) =>
                                    updateExpectedResult(
                                      stepIndex,
                                      expectedResultIndex,
                                      e.target.value,
                                    )
                                  }
                                  className="text-primary/60"
                                />
                              ) : (
                                <span className="text-primary/60">
                                  {expectedResult}
                                </span>
                              )}
                            </li>
                          ),
                        )}
                      </ul>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Screenshot */}
          {!testCase.screenshot_url ? null : (
            <div className="md:w-1/3 mt-4 md:mt-0">
              <div className="aspect-w-4 aspect-h-3 w-full">
                <TestCaseFrame screenshotUrl={testCase.screenshot_url} />
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default TestCard;
