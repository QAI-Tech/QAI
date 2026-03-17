"use client";

import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { MoreVertical, UserPlus, Plus } from "lucide-react";
import { TestCaseUnderExecutionSchema } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SendEmailButton } from "./send-email-button";
import { CreateJiraTicketsButton } from "./create-jira-tickets-button";
import { fetchJiraIntegrationStatus } from "@/app/store/jiraIntegrationSlice";
import type { AppDispatch, RootState } from "@/app/store/store";
import { useRouter } from "next/navigation";

interface TestRunToolbarMenuProps {
  testRunId: string;
  productId: string;
  testCases: TestCaseUnderExecutionSchema[];
  isQaiUser: boolean;
  isSelectionMode?: boolean;
  selectedTcuesCount?: number;
  onEnterSelectionMode?: () => void;
  onExitSelectionMode?: () => void;
  onBulkAssign?: () => void;
}

export function TestRunToolbarMenu({
  testRunId,
  productId,
  testCases,
  isQaiUser,
  isSelectionMode = false,
  selectedTcuesCount = 0,
  onEnterSelectionMode,
  onExitSelectionMode,
  onBulkAssign,
}: TestRunToolbarMenuProps) {
  const dispatch = useDispatch<AppDispatch>();
  const router = useRouter();
  const hasJiraIntegration = useSelector(
    (state: RootState) =>
      state.jiraIntegration.integrationStatus[productId] || false,
  );
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (productId) {
      dispatch(fetchJiraIntegrationStatus(productId));
    }
  }, [productId, dispatch]);

  const handleAddFlowsClick = () => {
    router.push(
      `/${productId}?showFlows=true&addFlowsMode=true&testRunId=${testRunId}`,
    );
  };

  // Determine if we should show the menu at all
  const hasJiraOption = hasJiraIntegration;
  const hasEmailOption = isQaiUser;
  const hasAssignOption = isQaiUser;
  const hasAddFlowsOption = isQaiUser;
  const shouldShowMenu =
    hasJiraOption || hasEmailOption || hasAssignOption || hasAddFlowsOption;

  if (!shouldShowMenu) {
    return null;
  }

  if (isSelectionMode) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {selectedTcuesCount} selected
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onExitSelectionMode?.();
          }}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onBulkAssign?.();
          }}
          disabled={selectedTcuesCount === 0}
        >
          Assign
        </Button>
      </div>
    );
  }

  return (
    <>
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
          <button
            title="More options"
            className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
          >
            <MoreVertical className="h-4 w-4 text-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-50 p-2 space-y-1"
          onClick={(e) => e.stopPropagation()}
        >
          {hasAddFlowsOption && (
            <div className="py-1">
              <button
                className="flex items-center gap-2 px-1.5 py-1.5 w-full rounded-md hover:bg-accent transition-colors text-foreground text-sm"
                title="Add flows to this test run"
                onClick={(e) => {
                  e.stopPropagation();
                  handleAddFlowsClick();
                  setIsOpen(false);
                }}
              >
                <Plus className="h-4 w-4 flex-shrink-0" />
                <span>Add Flows</span>
              </button>
            </div>
          )}
          {hasAssignOption && (
            <div
              className="py-1"
              onClick={(e) => {
                e.stopPropagation();
                onEnterSelectionMode?.();
                setIsOpen(false);
              }}
            >
              <button
                className="flex items-center gap-2 px-1.5 py-1.5 w-full rounded-md hover:bg-accent transition-colors text-foreground text-sm"
                title="Assign flows"
              >
                <UserPlus className="h-4 w-4 flex-shrink-0" />
                <span>Assign Flows</span>
              </button>
            </div>
          )}
          {hasJiraOption && (
            <div
              className="py-1"
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(false);
              }}
            >
              <CreateJiraTicketsButton
                productId={productId}
                testRunId={testRunId}
                testCases={testCases}
                showLabel={true}
              />
            </div>
          )}
          {hasEmailOption && (
            <div className="py-1">
              <SendEmailButton testRunId={testRunId} showLabel={true} />
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
