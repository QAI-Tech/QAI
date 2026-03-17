"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Plus, Network } from "lucide-react";
import type { testCaseSchema, Scenario } from "@/lib/types";
import { detectTestCaseParameters } from "@/lib/utils";
import { toast } from "sonner";

import { HotTable, type HotTableClass } from "@handsontable/react";
import { registerAllModules } from "handsontable/registry";
import type { CellChange, ChangeSource } from "handsontable/common";
import "handsontable/dist/handsontable.full.min.css";

// Register all Handsontable modules
registerAllModules();

interface ScenariosDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  input: testCaseSchema;
  setInput: (data: testCaseSchema) => void;
  readOnly?: boolean;
}

export function ScenariosDialog({
  isOpen,
  onOpenChange,
  input,
  setInput,
  readOnly = false,
}: ScenariosDialogProps) {
  const hotTableRef = useRef<HotTableClass>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [originalScenarios, setOriginalScenarios] = useState<Scenario[]>([]);
  const [workingScenarios, setWorkingScenarios] = useState<Scenario[]>([]);

  // Store original scenarios when dialog opens and create working copy
  useEffect(() => {
    if (isOpen) {
      const original = (input.scenarios || []).filter((scenario) => {
        // Only include scenarios with valid structure
        return (
          scenario &&
          typeof scenario.description === "string" &&
          scenario.description.trim() !== "" &&
          Array.isArray(scenario.params) &&
          scenario.params.every(
            (param) =>
              param &&
              typeof param.parameter_name === "string" &&
              param.parameter_name.trim() !== "" &&
              param.parameter_value !== undefined &&
              param.parameter_value !== null,
          )
        );
      });
      setOriginalScenarios(JSON.parse(JSON.stringify(original))); // Deep copy
      setWorkingScenarios(JSON.parse(JSON.stringify(original))); // Deep copy for working
      setHasUnsavedChanges(false);
    }
  }, [isOpen, input.scenarios]);

  // Disable keyboard navigation when dialog is open
  useEffect(() => {
    if (isOpen) {
      const handleKeyDown = (e: KeyboardEvent) => {
        // Check if the event target is within the Handsontable
        const target = e.target as HTMLElement;
        const isInHandsontable =
          target.closest(".handsontable") || target.closest(".htContextMenu");

        // If arrow keys are pressed and NOT within Handsontable, prevent default
        if (
          ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key) &&
          !isInHandsontable
        ) {
          e.preventDefault();
          e.stopPropagation();
        }
      };

      document.addEventListener("keydown", handleKeyDown, true);

      return () => {
        document.removeEventListener("keydown", handleKeyDown, true);
      };
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      const style = document.createElement("style");
      style.textContent = `
.htContextMenu {
  z-index: 99999 !important;
  pointer-events: auto !important;
}
.htContextMenu .ht_clone_top {
  z-index: 99999 !important;
  pointer-events: auto !important;
}
.htContextMenu tbody td {
  pointer-events: auto !important;
  cursor: pointer !important;
}
.htContextMenu tbody td:hover {
  background-color: #f3f4f6 !important;
}
[data-radix-popper-content-wrapper] {
  pointer-events: none !important;
}
`;
      document.head.appendChild(style);

      // Prevent dialog from closing when context menu items are clicked
      const handleContextMenuClick = (e: Event) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
      };

      // Also disable pointer events on dialog overlay when context menu is open
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === "childList") {
            const contextMenu = document.querySelector(".htContextMenu");
            const dialogOverlay = document.querySelector(
              "[data-radix-dialog-overlay]",
            );

            if (contextMenu && dialogOverlay) {
              (dialogOverlay as HTMLElement).style.pointerEvents = "none";

              // Added click event listeners to all context menu items
              const menuItems = contextMenu.querySelectorAll("tbody td");
              menuItems.forEach((item) => {
                item.addEventListener("click", handleContextMenuClick, true);
              });
            } else if (!contextMenu && dialogOverlay) {
              (dialogOverlay as HTMLElement).style.pointerEvents = "auto";
            }
          }
        });
      });

      observer.observe(document.body, { childList: true, subtree: true });

      return () => {
        document.head.removeChild(style);
        observer.disconnect();
        // Clean up event listeners
        const contextMenu = document.querySelector(".htContextMenu");
        if (contextMenu) {
          const menuItems = contextMenu.querySelectorAll("tbody td");
          menuItems.forEach((item) => {
            item.removeEventListener("click", handleContextMenuClick, true);
          });
        }
      };
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    let isMenuOpen = !!document.querySelector(".htContextMenu");

    const observer = new MutationObserver(() => {
      isMenuOpen = !!document.querySelector(".htContextMenu");
    });

    observer.observe(document.body, { childList: true, subtree: true });

    const stopIfMenuOpen = (e: Event) => {
      if (isMenuOpen) {
        e.stopPropagation();
      }
    };

    const eventTypes: (keyof DocumentEventMap)[] = [
      "pointermove",
      "mousemove",
      "mouseover",
      "mouseenter",
      "mouseleave",
      "wheel",
    ];

    eventTypes.forEach((type) =>
      document.addEventListener(type, stopIfMenuOpen, true),
    );

    return () => {
      observer.disconnect();
      eventTypes.forEach((type) =>
        document.removeEventListener(type, stopIfMenuOpen, true),
      );
    };
  }, [isOpen]);

  // Auto-detect parameters from test case content
  const detectedParameters = useMemo(() => {
    return detectTestCaseParameters(input);
  }, [input]);

  // Preserve existing scenario data while adding new parameters
  const scenarios = useMemo(() => {
    let currentScenarios = [...workingScenarios];

    // If no scenarios exist and we have detected parameters, create initial scenarios

    // Update existing scenarios while preserving ALL existing parameter values
    if (currentScenarios.length > 0) {
      currentScenarios = currentScenarios.map((scenario) => {
        const existingParams = scenario.params || [];
        const existingParamMap = new Map(
          existingParams.map((p) => [p.parameter_name, p.parameter_value]),
        );

        const updatedParams = detectedParameters.map((paramName) => ({
          parameter_name: paramName,
          parameter_value: existingParamMap.get(paramName) || "",
        }));

        return {
          ...scenario,
          params: updatedParams,
        };
      });
    }

    return currentScenarios;
  }, [workingScenarios, detectedParameters]);

  // Prepare data for Handsontable
  const tableData = useMemo(() => {
    return scenarios.map((scenario) => {
      const row: Record<string, string> = {
        description: scenario.description,
      };

      detectedParameters.forEach((paramName) => {
        const param = scenario.params.find(
          (p) => p.parameter_name === paramName,
        );
        row[paramName] = param?.parameter_value || "";
      });

      return row;
    });
  }, [scenarios, detectedParameters]);

  const columns = useMemo(() => {
    const cols = [
      {
        data: "description",
        title: "Scenario Description",
        width: 280,
        readOnly: readOnly,
      },
    ];

    detectedParameters.forEach((paramName) => {
      cols.push({
        data: paramName,
        title: paramName,
        width: 200,
        readOnly: readOnly,
      });
    });

    return cols;
  }, [detectedParameters, readOnly]);

  // Handled data changes
  const handleAfterChange = (
    changes: CellChange[] | null,
    source: ChangeSource,
  ) => {
    if (!changes || readOnly || source === "loadData") return;

    setHasUnsavedChanges(true);
    const updatedScenarios = [...scenarios];

    changes.forEach(([row, prop, , newValue]) => {
      const rowIndex = row as number;
      const propName = prop as string;
      const newVal = newValue as string;

      if (propName === "description") {
        updatedScenarios[rowIndex] = {
          ...updatedScenarios[rowIndex],
          description: newVal,
        };
      } else {
        const scenario = { ...updatedScenarios[rowIndex] };

        // Initialize params if it doesn't exist
        if (!scenario.params) {
          scenario.params = [];
        }

        const paramIndex = scenario.params.findIndex(
          (p) => p.parameter_name === propName,
        );

        if (paramIndex >= 0) {
          scenario.params = [...scenario.params];
          scenario.params[paramIndex] = {
            ...scenario.params[paramIndex],
            parameter_value: newVal,
          };
        } else {
          // If parameter doesn't exist, add it
          scenario.params = [
            ...scenario.params,
            {
              parameter_name: propName,
              parameter_value: newVal,
            },
          ];
        }

        updatedScenarios[rowIndex] = scenario;
      }
    });

    setWorkingScenarios(updatedScenarios);
  };

  // Add new scenario
  const addScenario = () => {
    if (readOnly) return;

    const newScenario: Scenario = {
      id: crypto.randomUUID(),
      description: `Scenario ${scenarios.length + 1}`,
      params: detectedParameters.map((paramName) => ({
        parameter_name: paramName,
        parameter_value: "",
      })),
    };

    const updatedScenarios = [...scenarios, newScenario];
    setWorkingScenarios(updatedScenarios);
    setHasUnsavedChanges(true);
  };

  // Save changes
  const handleSave = () => {
    // Validate scenarios before saving
    for (const scenario of workingScenarios) {
      if (
        !scenario.description ||
        typeof scenario.description !== "string" ||
        scenario.description.trim() === ""
      ) {
        toast.error("Each scenario must have a non-empty description.");
        return;
      }
      if (!Array.isArray(scenario.params)) {
        toast.error("Each scenario must have a params array.");
        return;
      }
      for (const param of scenario.params) {
        if (
          !param.parameter_name ||
          typeof param.parameter_name !== "string" ||
          param.parameter_name.trim() === ""
        ) {
          toast.error("All parameters must have a non-empty name.");
          return;
        }
        if (
          param.parameter_value === undefined ||
          param.parameter_value === null ||
          param.parameter_value === ""
        ) {
          toast.error(
            "All parameters must have a value (can be empty string, but not undefined/null).",
          );
          return;
        }
      }
    }
    setInput({ ...input, scenarios: workingScenarios });
    setHasUnsavedChanges(false);
    onOpenChange(false);
  };

  // Cancel changes
  const handleCancel = () => {
    setWorkingScenarios(JSON.parse(JSON.stringify(originalScenarios)));
    setHasUnsavedChanges(false);
    onOpenChange(false);
  };

  // Handle row removal
  const handleAfterRemoveRow = (index: number, amount: number) => {
    if (readOnly) return;

    setHasUnsavedChanges(true);
    const updatedScenarios = [...scenarios];
    updatedScenarios.splice(index, amount);
    setWorkingScenarios(updatedScenarios);
  };

  // Custom context menu with only specific options
  const customContextMenu = {
    items: {
      remove_row: { name: "Remove Row" },
      alignment: { name: "Alignment" },
      copy: { name: "Copy" },
      cut: { name: "Cut" },
    },
    uiContainer: typeof document !== "undefined" ? document.body : undefined,
  } as const;

  const hotSettings = {
    data: tableData,
    columns: columns,
    rowHeaders: true,
    colHeaders: true,
    contextMenu: customContextMenu,
    fillHandle: !readOnly,
    autoFill: !readOnly,
    copyPaste: true,
    dragToScroll: true,
    filters: false,
    columnSorting: false,
    manualColumnResize: true,
    manualRowResize: true,
    selectionMode: "multiple" as const,
    outsideClickDeselects: false,
    afterChange: handleAfterChange,
    afterRemoveRow: handleAfterRemoveRow,
    licenseKey: "non-commercial-and-evaluation",
    height: 400,
    stretchH: "all" as const,
    readOnly: readOnly,
  };

  // Handle dialog open/close
  const handleDialogOpenChange = (open: boolean) => {
    // Don't close dialog if context menu is open
    const contextMenu = document.querySelector(".htContextMenu");
    if (!open && contextMenu) {
      return;
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleDialogOpenChange}>
      <DialogContent
        className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col"
        hideCloseButton
      >
        <div className="flex-shrink-0 pb-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                <Network className="w-5 h-5 text-gray-600" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  Test Case Scenarios
                </h2>
                <div className="flex items-center gap-3 mt-1">
                  <Badge
                    variant="secondary"
                    className="bg-gray-100 text-gray-700 px-2 py-1 text-sm"
                  >
                    {scenarios.length}{" "}
                    {scenarios.length === 1 ? "Scenario" : "Scenarios"}
                  </Badge>
                  <Badge
                    variant="outline"
                    className="border-gray-300 text-gray-600 px-2 py-1 text-sm"
                  >
                    {detectedParameters.length}{" "}
                    {detectedParameters.length === 1
                      ? "Parameter"
                      : "Parameters"}
                  </Badge>
                  {hasUnsavedChanges && (
                    <Badge
                      variant="destructive"
                      className="bg-orange-100 text-orange-700 border-orange-200 px-2 py-1 text-sm"
                    >
                      Unsaved Changes
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!readOnly && (
                <Button
                  onClick={addScenario}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 font-medium"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Scenario
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 p-6 min-h-0 overflow-hidden">
          <div className="border border-gray-200 rounded-lg overflow-hidden bg-white h-full">
            <HotTable ref={hotTableRef} settings={hotSettings} />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center p-6 border-t border-gray-200 flex-shrink-0">
          <div className="text-sm text-gray-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            <span className="font-medium text-amber-800">Note:</span>
            <span className="text-amber-700 ml-1">
              Parameters are automatically detected from test case content and
              cannot be manually edited.
            </span>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleCancel}
              variant="outline"
              className="px-4 py-2 bg-transparent"
            >
              Cancel
            </Button>
            {!readOnly && (
              <Button
                onClick={handleSave}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 font-medium"
              >
                Save Changes
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
