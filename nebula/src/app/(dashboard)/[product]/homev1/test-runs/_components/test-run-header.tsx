"use client";

import { useEffect, useState } from "react";
import {
  Search,
  ChevronDown,
  Plus,
  Pencil,
  Copy,
  Trash2,
  Mail,
  Download,
  UserPlus,
  RefreshCw,
  Repeat2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { User } from "@/lib/types";
import { NOVA_USER } from "@/lib/constants";
import { isIOSProduct } from "@/lib/utils";
import { useProductSwitcher } from "@/providers/product-provider";

interface HeaderProps {
  title: string;
  metrics: {
    progress: number;
    passed: number;
    failed: number;
    untested: number;
    attemptFailed: number;
    skipped: number;
  };
  onSearch: (query: string) => void;
  onFilter?: (status: string | null) => void;
  onUserFilter?: (userId: string | null) => void;
  selectedUser?: string | null;
  users?: User[];
  isQaiUser?: boolean;
  onAddNewTestCases?: () => void;
  onSendEmail?: () => void;
  onExport?: () => void;
  // New selection mode props
  isSelectionMode?: boolean;
  selectedCount?: number;
  onEnterSelectionMode?: () => void;
  onExitSelectionMode?: () => void;
  onCopyTestCases?: () => void;
  onDeleteTestCases?: () => void;
  onBulkAssign?: () => void | Promise<void>;
  isAllSelected?: boolean;
  onToggleAll?: () => void;
  shouldAutoReload?: boolean;
  setShouldAutoReload: (value: boolean) => void;
  onSync?: () => void | Promise<void>;
  isSyncing?: boolean;
  onCreateJiraTickets?: () => void | Promise<void>;
  isCreatingJiraTickets?: boolean;
  hasJiraIntegration?: boolean;
}

export function Header({
  title,
  metrics,
  onSearch,
  onFilter,
  onUserFilter,
  selectedUser,
  users,
  isQaiUser,
  onAddNewTestCases,
  onSendEmail,
  onExport,
  isSelectionMode = false,
  selectedCount = 0,
  onEnterSelectionMode,
  onExitSelectionMode,
  onCopyTestCases,
  onDeleteTestCases,
  onBulkAssign,
  isAllSelected = false,
  onToggleAll,
  shouldAutoReload,
  setShouldAutoReload,
  onSync,
  isSyncing = false,
  onCreateJiraTickets,
  isCreatingJiraTickets = false,
  hasJiraIntegration = false,
}: HeaderProps) {
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const { productSwitcher } = useProductSwitcher();

  const isIOS = isIOSProduct(productSwitcher);

  // Call onFilter with null (All) on first render | Used useEffect for the initial filter call
  useEffect(() => {
    if (onFilter) {
      onFilter(null);
    }
  }, [onFilter]);

  // Calculate total count
  const totalCount =
    metrics.passed +
    metrics.failed +
    metrics.untested +
    metrics.attemptFailed +
    metrics.skipped;

  // Handle filter toggle
  const handleFilterToggle = (status: string | null) => {
    // If clicking the same filter, clear it (toggle off)
    if (status === activeFilter) {
      setActiveFilter(null);
      if (onFilter) onFilter(null);
    } else {
      // Otherwise set the new filter
      setActiveFilter(status);

      // Specially handled for FAILED status to add criticality sorting
      if (onFilter) onFilter(status);
    }
  };

  return (
    <header className="border-b border-gray-200 bg-white p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">{title}</h1>

        <div className="flex items-center gap-4">
          {!isSelectionMode ? (
            <>
              {/* Only show edit button for QAI users */}
              {onEnterSelectionMode && isQaiUser && (
                <Button
                  onClick={onEnterSelectionMode}
                  variant="outline"
                  className="h-10 w-10 p-0 relative group bg-transparent"
                  title="Edit"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
              {onSync && isQaiUser && (
                <Button
                  onClick={onSync}
                  variant="outline"
                  className="h-10 w-10 p-0 relative group bg-transparent"
                  disabled={isSyncing}
                  title="Sync All Test Case Under Executions"
                >
                  <RefreshCw
                    className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`}
                  />
                  <span className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 bg-black text-white text-xs rounded px-2 py-1 opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity">
                    Sync All Test Case Under Executions
                  </span>
                </Button>
              )}
              {onCreateJiraTickets && hasJiraIntegration && (
                <Button
                  onClick={onCreateJiraTickets}
                  variant="outline"
                  className="h-10 w-10 p-0 relative group bg-transparent"
                  disabled={isCreatingJiraTickets}
                >
                  <Repeat2 className="h-4 w-4" />
                  <span className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 bg-black text-white text-xs rounded px-2 py-1 opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity">
                    Create Jira Tickets
                  </span>
                </Button>
              )}
              {onSendEmail && (
                <Button
                  onClick={onSendEmail}
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  <Mail className="h-4 w-4" />
                  Send Email
                </Button>
              )}
              {onExport && (
                <Button
                  onClick={onExport}
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  <Download className="h-4 w-4" />
                  Export Report
                </Button>
              )}
              {onAddNewTestCases && (
                <Button
                  onClick={onAddNewTestCases}
                  className="flex items-center gap-2 bg-purple-600 text-white hover:bg-purple-700"
                >
                  <Plus className="h-4 w-4" />
                  Add New Test Cases To This Run
                </Button>
              )}
            </>
          ) : (
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">
                {selectedCount} test cases selected
              </span>
              <Button
                variant="outline"
                onClick={onExitSelectionMode}
                title="Cancel Selection"
              >
                Cancel
              </Button>
              {isQaiUser && (
                <>
                  <Button
                    onClick={onCopyTestCases}
                    variant="outline"
                    className="h-10 w-10 p-0 relative group bg-transparent"
                    disabled={selectedCount === 0}
                    title="Copy TCUE to Product"
                  >
                    <Copy className="h-4 w-4" />
                    <span className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 bg-black text-white text-xs rounded px-2 py-1 opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity">
                      Copy TCUE to Product
                    </span>
                  </Button>
                  <Button
                    onClick={onDeleteTestCases}
                    variant="outline"
                    className="h-10 w-10 p-0 relative group bg-transparent"
                    disabled={selectedCount === 0}
                    title="Delete Selected Test Cases"
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                    <span className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 bg-black text-white text-xs rounded px-2 py-1 opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity">
                      Delete Selected Test Cases
                    </span>
                  </Button>
                  <Button
                    onClick={async () => {
                      if (onBulkAssign) {
                        await onBulkAssign();
                      }
                    }}
                    variant="outline"
                    className="h-10 w-10 p-0 relative group bg-transparent"
                    disabled={selectedCount === 0}
                    title="Assign Test Cases"
                  >
                    <UserPlus className="h-4 w-4 text-purple-500" />
                    <span className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 bg-black text-white text-xs rounded px-2 py-1 opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity">
                      Assign Test Cases
                    </span>
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-4">
        <span
          className={cn(
            "px-3 py-1 text-sm",
            metrics.progress === 100
              ? "rounded-full bg-purple-600 text-white"
              : "text-purple-600",
          )}
        >
          {metrics.progress}% Done
        </span>
      </div>

      {/* Filter Pills Row */}
      <div className="mt-5 flex flex-wrap gap-2">
        <button
          onClick={() => handleFilterToggle(null)}
          className={`rounded-full px-4 py-1.5 text-sm transition-colors flex items-center gap-2 ${
            activeFilter === null
              ? "bg-gray-900 text-white"
              : "bg-gray-100 hover:bg-gray-300 text-gray-900"
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${activeFilter === null ? "bg-gray-100" : "bg-gray-400"}`}
          ></span>
          {totalCount} All
        </button>
        <button
          onClick={() => handleFilterToggle("FAILED")}
          className={`rounded-full px-4 py-1.5 text-sm transition-colors flex items-center gap-2 ${
            activeFilter === "FAILED"
              ? "bg-red-100 text-red-600"
              : "bg-gray-100 hover:bg-gray-300 text-gray-800"
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${activeFilter === "FAILED" ? "bg-red-600" : "bg-gray-400"}`}
          ></span>
          {metrics.failed} Failed
        </button>
        <button
          onClick={() => handleFilterToggle("PASSED")}
          className={`rounded-full px-4 py-1.5 text-sm transition-colors flex items-center gap-2 ${
            activeFilter === "PASSED"
              ? "bg-emerald-100 text-emerald-600"
              : "bg-gray-100 hover:bg-gray-300 text-gray-800"
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${activeFilter === "PASSED" ? "bg-emerald-600" : "bg-gray-400"}`}
          ></span>
          {metrics.passed} Passed
        </button>
        <button
          onClick={() => handleFilterToggle("UNTESTED")}
          className={`rounded-full px-4 py-1.5 text-sm transition-colors flex items-center gap-2 ${
            activeFilter === "UNTESTED"
              ? "bg-yellow-100 text-yellow-500"
              : "bg-gray-100 hover:bg-gray-300 text-gray-900"
          } ${!isQaiUser ? "hidden" : ""}`}
        >
          <span
            className={`w-2 h-2 rounded-full ${activeFilter === "UNTESTED" ? "bg-yellow-500" : "bg-gray-400"}`}
          ></span>
          {metrics.untested} Untested
        </button>
        <button
          onClick={() => handleFilterToggle("ATTEMPT_FAILED")}
          className={`rounded-full px-4 py-1.5 text-sm transition-colors flex items-center gap-2 ${
            activeFilter === "ATTEMPT_FAILED"
              ? "bg-orange-100 text-orange-600"
              : "bg-gray-100 hover:bg-gray-300 text-gray-800"
          } ${!isQaiUser ? "hidden" : ""}`}
        >
          <span
            className={`w-2 h-2 rounded-full ${activeFilter === "ATTEMPT_FAILED" ? "bg-orange-600" : "bg-gray-400"}`}
          ></span>
          {metrics.attemptFailed} Attempt failed
        </button>
        <button
          onClick={() => handleFilterToggle("SKIPPED")}
          className={`rounded-full px-4 py-1.5 text-sm transition-colors flex items-center gap-2 ${
            activeFilter === "SKIPPED"
              ? "bg-blue-100 text-blue-600"
              : "bg-gray-100 hover:bg-gray-300 text-gray-800"
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${activeFilter === "SKIPPED" ? "bg-blue-600" : "bg-gray-400"}`}
          ></span>
          {metrics.skipped} Skipped
        </button>
      </div>

      {/* Show Test Cases Assigned */}
      {isQaiUser && (
        <div className="mt-6 flex items-center gap-4">
          <span className="text-sm font-medium text-gray-700">
            Show Test Cases Assigned To:
          </span>
          <Select
            value={selectedUser || "all"}
            onValueChange={(value) => {
              if (onUserFilter) onUserFilter(value === "all" ? null : value);
            }}
          >
            <SelectTrigger className="w-[240px]">
              <SelectValue placeholder="All TCUE's" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All TCUE&apos;s</SelectItem>
              {!isIOS && (
                <SelectItem key={NOVA_USER.user_id} value={NOVA_USER.user_id}>
                  {NOVA_USER.first_name} {NOVA_USER.last_name}
                </SelectItem>
              )}
              {users?.map((user) => (
                <SelectItem key={user.user_id} value={user.user_id}>
                  {user.first_name} {user.last_name} ({user.email})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="mt-6 flex gap-4 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
          <Input
            type="search"
            placeholder="Search by test case ID or description"
            className="w-full pl-10"
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>

        {/* Toggle Button */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground text-purple-600 font-bold">
            Auto-Reload
          </span>
          <Switch
            checked={shouldAutoReload}
            onCheckedChange={setShouldAutoReload}
            className="data-[state=checked]:bg-purple-600 bg-black"
          />
        </div>

        {/* Sort Button (currently hidden) */}
        <Button variant="outline" className="gap-2 hidden">
          Sort by
          <ChevronDown className="h-4 w-4" />
        </Button>
      </div>

      {/* Selection mode controls*/}
      {isSelectionMode && isQaiUser && (
        <div className="mt-4 flex items-center gap-2">
          <Checkbox
            checked={isAllSelected}
            className="h-4 w-4 rounded border border-gray-300 focus:outline-none data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
            onCheckedChange={onToggleAll}
          />
          <span className="text-sm text-gray-600">Select All Features</span>
        </div>
      )}
    </header>
  );
}
