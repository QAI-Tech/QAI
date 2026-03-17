"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Network, FileText, Info } from "lucide-react";
import { ScenariosDialog } from "./scenarios-dialog";
import type { testCaseSchema } from "@/lib/types";
import { detectTestCaseParameters } from "@/lib/utils";

interface TestCaseInputProps {
  input: testCaseSchema;
  setInput: (data: testCaseSchema) => void;
  readOnly?: boolean;
}

export function Scenarios({
  input,
  setInput,
  readOnly = false,
}: TestCaseInputProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const scenarioCount = input.scenarios?.length || 0;

  // Auto-detect parameters from test case content
  const detectedParameters = useMemo(() => {
    return detectTestCaseParameters(input);
  }, [input]);

  const hasParameters = detectedParameters.length > 0;

  // Show scenarios section if editing OR if scenarios exist
  const shouldShowScenariosSection = !readOnly || scenarioCount > 0;

  if (!hasParameters && scenarioCount === 0) {
    return (
      <>
        <Card className="border border-gray-200 bg-gray-50">
          <CardContent className="p-6">
            <div className="text-center space-y-4">
              <div className="mx-auto w-12 h-12 bg-gray-200 rounded-lg flex items-center justify-center">
                <Network className="w-6 h-6 text-gray-500" />
              </div>

              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  No Test Scenarios Available
                </h3>

                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 text-left max-w-xl mx-auto">
                  <p className="text-blue-800 mb-3">
                    Add parameters using double curly braces{" "}
                    <code className="bg-purple-100 px-2 py-1 rounded text-sm font-mono">
                      {"{{parameter}}"}
                    </code>{" "}
                    in any of these fields (Description, Preconditions, Steps,
                    Expected Results) to automatically generate scenarios.
                  </p>

                  <div className="flex items-center gap-2 p-2 bg-purple-100 rounded">
                    <Info className="w-4 h-4 text-purple-600" />
                    <p className="text-sm text-blue-800 font-medium">
                      Once parameters are detected, test scenarios will be
                      automatically created for data-driven testing!
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <ScenariosDialog
          isOpen={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          input={input}
          setInput={setInput}
          readOnly={readOnly}
        />
      </>
    );
  }

  if (!shouldShowScenariosSection) {
    return null;
  }

  return (
    <>
      <Card className="border border-gray-200 bg-white">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                <Network className="w-6 h-6 text-gray-600" />
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Test Scenarios
                </h3>
                <Badge
                  variant="secondary"
                  className="bg-gray-100 text-gray-700 px-3 py-1 text-sm"
                >
                  {scenarioCount}{" "}
                  {scenarioCount === 1 ? "Scenario" : "Scenarios"}
                </Badge>
              </div>
            </div>

            <Button
              onClick={() => setIsDialogOpen(true)}
              className={`px-4 py-2 font-medium ${
                readOnly
                  ? "bg-purple-600 hover:bg-purple-700 text-white"
                  : "bg-purple-600 hover:bg-purple-700 text-white"
              }`}
              disabled={readOnly && scenarioCount === 0}
            >
              <FileText className="w-4 h-4 mr-2" />
              {readOnly ? "View Scenarios" : "Manage Scenarios"}
            </Button>
          </div>

          {detectedParameters.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <h4 className="text-sm font-medium text-gray-700 mb-2">
                Parameters:
              </h4>
              <Badge
                variant="secondary"
                className="bg-gray-100 text-gray-700 px-3 py-1 text-sm mb-3"
              >
                {detectedParameters.length}{" "}
                {detectedParameters.length === 1 ? "Parameter" : "Parameters"}
              </Badge>
              <div className="flex flex-wrap gap-2">
                {detectedParameters.map((param) => (
                  <span
                    key={param}
                    className="inline-flex items-center px-2 py-1 rounded text-sm bg-gray-100 text-gray-700 border border-gray-200"
                  >
                    {param}
                  </span>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <ScenariosDialog
        isOpen={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        input={input}
        setInput={setInput}
        readOnly={readOnly}
      />
    </>
  );
}
