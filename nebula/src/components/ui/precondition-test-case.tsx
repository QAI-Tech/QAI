"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"
import { Combobox } from "@/components/ui/combobox-pop-search"
import { Textarea } from "@/components/ui/textarea"
import type { testCaseSchema } from "@/lib/types"

interface PreconditionTestCaseProps {
  testCase: testCaseSchema
  allTestCases: testCaseSchema[]
  onPreconditionTestCaseChange: (value: string) => void
  isEditing: boolean
  isLoading: boolean
  isCollapsible?: boolean
}

export function PreconditionTestCase({
  testCase,
  allTestCases,
  onPreconditionTestCaseChange,
  isEditing,
  isLoading,
  isCollapsible = true,
}: PreconditionTestCaseProps) {
  const [isCollapsed, setIsCollapsed] = useState(true) // Default: collapsed

  // Precondition Test Case dropdown options
  const preconditionOptions = [
    { value: "", label: "None" },
    ...allTestCases
      .filter((tc) => tc.test_case_id !== testCase.test_case_id) // Exclude self
      .map((tc) => {
        const label = tc.title ? tc.title : tc.test_case_description
        // Truncate long labels to prevent overflow
        const truncatedLabel = label.length > 80 ? `${label.substring(0, 80)}...` : label
        return {
          value: tc.test_case_id,
          label: truncatedLabel,
        }
      }),
  ]

  // Find the selected precondition test case for non-editing mode
  const selectedPreconditionTestCase = testCase.precondition_test_case_id
    ? allTestCases.find((tc) => tc.test_case_id === testCase.precondition_test_case_id)
    : null

  // Get the full description for display in non-editing mode
  const preconditionDescription = selectedPreconditionTestCase
    ? selectedPreconditionTestCase.title || selectedPreconditionTestCase.test_case_description || ""
    : ""

  const PreconditionContent = () => (
    isEditing ? (
      <div className="relative w-full">
        <div className="w-full max-w-full overflow-hidden">
          <Combobox
            options={preconditionOptions}
            value={testCase.precondition_test_case_id || ""}
            onChange={onPreconditionTestCaseChange}
            placeholder="Select a precondition test case..."
            emptyMessage="No test case found."
            buttonLabel="Select Test Case..."
            disabled={!isEditing || isLoading}
            popoverClassName="w-[500px] max-w-[calc(100vw-320px)]"
          />
        </div>
      </div>
    ) : (
      <div className="relative w-full">
        <div className="w-full max-w-full overflow-hidden">
          {preconditionDescription ? (
            <Textarea
              value={preconditionDescription}
              readOnly
              disabled
              className="min-h-[80px] w-full resize-none bg-white border-gray-200"
              style={{ height: "auto", minHeight: "80px" }}
            />
          ) : (
            <div className="min-h-[80px] w-full border border-gray-200 rounded-md p-3 bg-gray-50 text-gray-500 text-sm">
              No precondition test case selected
            </div>
          )}
        </div>
      </div>
    )
  )

  if (!isCollapsible) {
    return (
      <div className="space-y-3 w-full" style={{ fontFamily: "Instrumental Sans, sans-serif" }}>
        <PreconditionContent />
      </div>
    )
  }

  return (
    <div className="space-y-4 w-full" style={{ fontFamily: "Instrumental Sans, sans-serif" }}>
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="flex w-full items-center justify-between py-2 text-lg font-bold hover:text-purple-600 transition-colors"
        style={{ color: "#1F2937" }}
      >
        <span>Precondition Test Case</span>
        <ChevronDown className={`h-5 w-5 transition-transform ${!isCollapsed && "rotate-180"}`} />
      </button>

      {!isCollapsed && (
        <div className="pl-0 space-y-3 w-full overflow-hidden">
          {isEditing ? (
            <>
              <h4 className="text-sm font-medium text-gray-700 pr-4">
                Select a precondition test case that must be executed before this test
              </h4>
              <PreconditionContent />
            </>
          ) : (
            <>
              <h4 className="text-sm font-medium text-gray-700 pr-4">
                This precondition test case that must be executed before this test
              </h4>
              <PreconditionContent />
            </>
          )}
        </div>
      )}
    </div>
  )
}
