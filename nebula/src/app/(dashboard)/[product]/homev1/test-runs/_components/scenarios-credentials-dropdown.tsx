"use client";

import { useMemo } from "react";
import { useSelector } from "react-redux";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import type {
  Credential,
  TestCaseUnderExecutionSchema,
  testCaseSchema,
} from "@/lib/types";
import { TestCaseUnderExecutionStatus } from "@/lib/types";
import { mapTcueToBestScenarioMeta } from "@/lib/scenarioMatching";
import { useRouter } from "next/navigation";
import type { RootState } from "@/app/store/store";

interface ScenariosCredentialsDropdownProps {
  testCasesUnderExecution: TestCaseUnderExecutionSchema[];
  selectedTcueIndex: number;
  onTcueSelect: (index: number) => void;
  className?: string;
  testCase?: testCaseSchema;
  placeholder?: string;
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

export default function ScenariosCredentialsDropdown({
  testCasesUnderExecution: tcueList,
  selectedTcueIndex,
  onTcueSelect,
  className = "",
  testCase,
  placeholder = "Choose a variant...",
}: ScenariosCredentialsDropdownProps) {
  const selectedTcueId = tcueList?.[selectedTcueIndex]?.id?.toString();
  const router = useRouter();
  const credentialItems = useSelector(
    (state: RootState) => state.credentials.items,
  ) as Record<string, Credential>;
  const credentialsLoading = useSelector(
    (state: RootState) => state.credentials.loading,
  );

  const matchScenarioMetaForTcue = useMemo(() => {
    return mapTcueToBestScenarioMeta(tcueList, testCase?.scenarios || []);
  }, [tcueList, testCase?.scenarios]);

  const getDisplayParams = (tcue: TestCaseUnderExecutionSchema): string[] => {
    const matchedMeta = matchScenarioMetaForTcue[tcue.id];
    const fromScenarioParams = tcue?.scenario_parameters
      ? Object.values(tcue.scenario_parameters)
      : [];
    const fromMetaParams = (matchedMeta?.params || []).map(
      (p) => p.parameter_value,
    );

    const rawList = (
      fromScenarioParams.length > 0 ? fromScenarioParams : fromMetaParams
    ).filter(Boolean);

    return Array.from(new Set(rawList));
  };

  const getDisplayMeta = (tcue: TestCaseUnderExecutionSchema) => {
    const metas = testCase?.scenarios || [];
    const values = getDisplayParams(tcue)
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

    return matchScenarioMetaForTcue[tcue.id];
  };

  const getCredentialDisplay = (cred: Credential | undefined): string => {
    if (!cred) return "";

    if (cred.description && cred.description.trim()) {
      return cred.description.trim();
    }

    const creds = cred.credentials || {};

    const username = creds.username;
    if (username) return username;

    const entries = Object.entries(creds).filter(([, v]) => v);
    const firstField = entries.find(([, v]) => v);
    if (firstField) {
      const [key, value] = firstField;
      const label =
        key.toLowerCase() === "pin"
          ? "PIN"
          : key.charAt(0).toUpperCase() + key.slice(1);
      return `${label}: ${value}`;
    }

    return "";
  };

  const getCredentialBadges = (tcue: TestCaseUnderExecutionSchema) => {
    const ids = tcue.credentials || [];
    const labels = ids.map((id) => getCredentialDisplay(credentialItems?.[id]));
    const visible = labels.filter(Boolean);
    return {
      primary: visible[0] || "",
      extraCount: Math.max(0, visible.length - 1),
      hasIds: ids.length > 0,
    };
  };

  const handleTcueChange = (val: string) => {
    const idx = tcueList.findIndex((t) => t.id?.toString() === val);
    if (idx !== -1) {
      onTcueSelect(idx);

      const url = new URL(window.location.href);
      url.searchParams.set("tcue", val);
      router.replace(url.pathname + url.search);
    }
  };

  return (
    <div className={className}>
      <Select value={selectedTcueId} onValueChange={handleTcueChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {tcueList.map((tcue, index) => {
            const paramsToShow = getDisplayParams(tcue);
            const displayMeta = getDisplayMeta(tcue);
            const creds = getCredentialBadges(tcue);

            const isFlowIdGrouping =
              !testCase?.scenarios || testCase.scenarios.length === 0;
            const scenarioName = isFlowIdGrouping
              ? `Scenario ${index + 1}`
              : displayMeta?.description || "Untitled Scenario";

            return (
              <SelectItem
                key={tcue.id?.toString() ?? index}
                value={tcue.id?.toString() ?? index.toString()}
              >
                <div className="flex items-center gap-2 w-full">
                  <Badge
                    variant="secondary"
                    className={getStatusColor(getStatusDisplay(tcue.status))}
                  >
                    {getStatusDisplay(tcue.status)}
                  </Badge>

                  <span className="font-medium">{scenarioName}</span>

                  {creds.primary ? (
                    <Badge
                      variant="outline"
                      className="bg-blue-50 max-w-[180px] truncate"
                      title={creds.primary}
                    >
                      {creds.primary}
                    </Badge>
                  ) : creds.hasIds ? (
                    <Badge variant="outline" className="bg-blue-50">
                      {credentialsLoading ? "Loading…" : "—"}
                    </Badge>
                  ) : null}
                  {creds.extraCount > 0 && (
                    <Badge variant="outline" className="bg-blue-50">
                      +{creds.extraCount}
                    </Badge>
                  )}

                  {paramsToShow.length > 0 && (
                    <div className="flex items-center gap-2 ml-auto">
                      {paramsToShow.map((value, i) => (
                        <Badge
                          key={`${tcue.id}-${i}-${value}`}
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
  );
}
