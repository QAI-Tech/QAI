"use client";

import { useState } from "react";
import { useSelector } from "react-redux";
import { Repeat2 } from "lucide-react";
import { toast } from "sonner";
import { TestCaseUnderExecutionSchema } from "@/lib/types";
import type { RootState } from "@/app/store/store";

interface CreateJiraTicketsButtonProps {
  productId: string;
  testRunId: string;
  testCases: TestCaseUnderExecutionSchema[];
  showLabel?: boolean;
}

export function CreateJiraTicketsButton({
  productId,
  testRunId,
  testCases,
  showLabel = false,
}: CreateJiraTicketsButtonProps) {
  const hasJiraIntegration = useSelector(
    (state: RootState) =>
      state.jiraIntegration.integrationStatus[productId] || false,
  );
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateJiraTickets = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isCreating) return;

    const failedTestCases = testCases.filter((tc) => tc.status === "FAILED");
    if (failedTestCases.length === 0) {
      toast.error("No failed test cases found");
      return;
    }

    try {
      setIsCreating(true);
      toast.info("Creating Jira tickets for failed tests...");

      const response = await fetch(
        "/api/create-jira-tickets-for-failed-tests",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            product_id: productId,
            test_run_id: testRunId,
            failed_test_case_ids: failedTestCases.map((tc) => tc.id),
          }),
        },
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create Jira tickets");
      }

      const result = await response.json();
      toast.success(
        `Successfully created ${result.tickets_created} Jira ticket(s)`,
      );
    } catch (error) {
      console.error("Error creating Jira tickets:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to create Jira tickets",
      );
    } finally {
      setIsCreating(false);
    }
  };

  if (!hasJiraIntegration) {
    return null;
  }

  return (
    <button
      onClick={handleCreateJiraTickets}
      disabled={isCreating}
      className={
        showLabel
          ? "flex items-center gap-2 px-1.5 py-1.5 w-full rounded-md hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-foreground text-sm"
          : "relative group h-4 w-4 flex items-center justify-center rounded-md hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed ml-2 flex-shrink-0"
      }
      title="Create Jira Tickets"
    >
      <Repeat2
        className={`h-4 w-4 text-foreground flex-shrink-0 ${isCreating ? "animate-spin" : ""}`}
      />
      {showLabel && <span>Create Jira Tickets</span>}
    </button>
  );
}
