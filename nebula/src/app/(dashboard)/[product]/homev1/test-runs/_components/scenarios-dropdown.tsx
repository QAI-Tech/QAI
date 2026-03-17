"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import type { TestCaseUnderExecutionSchema, testCaseSchema } from "@/lib/types";
import { TestCaseUnderExecutionStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { mapTcueToBestScenarioMeta } from "@/lib/scenarioMatching";
import { useRouter } from "next/navigation";

interface ScenariosDropdownProps {
  testCasesUnderExecution: TestCaseUnderExecutionSchema[];
  selectedScenarioIndex: number;
  onScenarioSelect: (index: number) => void;
  className?: string;
  testCase?: testCaseSchema;
}

function getStatusDisplay(status: TestCaseUnderExecutionStatus | undefined) {
  if (!status) {
    return TestCaseUnderExecutionStatus.UNTESTED;
  }
  return status;
}

function getStatusColor(status: TestCaseUnderExecutionStatus) {
  switch (status) {
    case TestCaseUnderExecutionStatus.PASSED:
      return "text-emerald-600 bg-emerald-100";
    case TestCaseUnderExecutionStatus.FAILED:
      return "text-red-600 bg-red-100";
    case TestCaseUnderExecutionStatus.SKIPPED:
      return "text-gray-600 bg-gray-100";
    case TestCaseUnderExecutionStatus.ATTEMPT_FAILED:
      return "text-orange-600 bg-orange-100";
    case TestCaseUnderExecutionStatus.UNTESTED:
    default:
      return "text-blue-600 bg-blue-100";
  }
}

export default function ScenariosDropdown({
  testCasesUnderExecution: scenarios,
  selectedScenarioIndex,
  onScenarioSelect,
  className = "",
  testCase,
}: ScenariosDropdownProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const selectedScenarioId = scenarios?.[selectedScenarioIndex]?.id?.toString();
  const router = useRouter();

  const matchScenarioMetaForTcue = useMemo(() => {
    return mapTcueToBestScenarioMeta(scenarios, testCase?.scenarios || []);
  }, [scenarios, testCase?.scenarios]);

  const getDisplayParams = (
    scenario: TestCaseUnderExecutionSchema,
  ): string[] => {
    const matchedMeta = matchScenarioMetaForTcue[scenario.id];
    const fromScenarioParams = scenario?.scenario_parameters
      ? Object.values(scenario.scenario_parameters)
      : [];
    const fromMetaParams = (matchedMeta?.params || []).map(
      (p) => p.parameter_value,
    );

    const rawList = (
      fromScenarioParams.length > 0 ? fromScenarioParams : fromMetaParams
    ).filter(Boolean);

    return Array.from(new Set(rawList));
  };

  const getDisplayMeta = (scenario: TestCaseUnderExecutionSchema) => {
    const metas = testCase?.scenarios || [];
    const values = getDisplayParams(scenario)
      .map((v) => (v || "").toLowerCase().trim())
      .filter(Boolean);

    if (values.length > 0 && metas.length > 0) {
      const valueSet = new Set(values);
      const exact = metas.find((m) => {
        const params = (m.params || [])
          .map((p) => (p.parameter_value || "").toLowerCase().trim())
          .filter(Boolean);
        return params.length > 0 && params.every((p) => valueSet.has(p));
      });
      if (exact) return exact;
    }

    return matchScenarioMetaForTcue[scenario.id];
  };

  const handleScenarioChange = (val: string) => {
    const idx = scenarios.findIndex((s) => s.id?.toString() === val);
    if (idx !== -1) {
      // Call the parent's handler
      onScenarioSelect(idx);

      // Update URL using Next.js router
      const url = new URL(window.location.href);
      url.searchParams.set("tcue", val);
      router.replace(url.pathname + url.search);
    }
  };

  return (
    <div className={className}>
      <hr className="border-gray-200 mb-6" />
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <button className="flex w-full items-center justify-between py-2 text-lg font-bold hover:text-purple-600 transition-colors">
            <span>Scenarios</span>
            <ChevronDown
              className={cn(
                "h-5 w-5 transition-transform",
                isExpanded && "rotate-180",
              )}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <div className="rounded-lg border bg-white p-4">
            <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
              <span>{scenarios.length} Scenarios</span>
              {scenarios[selectedScenarioIndex] && (
                <span>
                  {getDisplayParams(scenarios[selectedScenarioIndex]).length}{" "}
                  Parameters
                </span>
              )}
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">
                Select Scenario
              </label>
              <Select
                value={selectedScenarioId}
                onValueChange={handleScenarioChange}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a scenario..." />
                </SelectTrigger>
                <SelectContent>
                  {scenarios.map((scenario, index) => {
                    const paramsToShow = getDisplayParams(scenario);
                    const displayMeta = getDisplayMeta(scenario);

                    const isFlowIdGrouping =
                      !testCase?.scenarios || testCase.scenarios.length === 0;
                    const scenarioName = isFlowIdGrouping
                      ? `Scenario ${index + 1}`
                      : displayMeta?.description || "Untitled Scenario";

                    return (
                      <SelectItem
                        key={scenario.id?.toString() ?? index}
                        value={scenario.id?.toString() ?? index.toString()}
                      >
                        <div className="flex items-center gap-2 w-full">
                          <Badge
                            variant="secondary"
                            className={getStatusColor(
                              getStatusDisplay(scenario.status),
                            )}
                          >
                            {getStatusDisplay(scenario.status)}
                          </Badge>
                          <span className="font-medium">{scenarioName}</span>
                          {paramsToShow.length > 0 && (
                            <div className="flex items-center gap-2 ml-auto">
                              {paramsToShow.map((value, i) => (
                                <Badge
                                  key={`${scenario.id}-${i}-${value}`}
                                  variant="outline"
                                  className="bg-gray-50"
                                >
                                  {value}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
