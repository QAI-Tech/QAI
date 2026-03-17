"use client";

import {
  Trash2,
  ChevronLeft,
  Share2,
  RefreshCw,
  Workflow,
  Eye,
  Play,
  CheckCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CriticalitySelect } from "@/components/ui/criticality-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Criticality, TestCaseUnderExecutionSchema } from "@/lib/types";
import { toast } from "sonner";
import { useUser } from "@clerk/nextjs";
import { isQaiOrgUser, isQaiOrgAnalystUser } from "@/lib/constants";

interface HeaderProps {
  handleClose: () => void;
  isLoading: {
    status: boolean;
    action?: string | null;
  };
  criticality: Criticality | "";
  handleCriticalityChange: (value: Criticality) => Promise<void>;
  featureName: string;
  title?: string;
  onDelete?: () => void;
  onSync?: () => void;
  tcueData?: TestCaseUnderExecutionSchema;
  showFlowViewer?: () => void;

  showBack?: boolean;
  showShare?: boolean;
  showCriticality?: boolean;
  showSync?: boolean;
  showFlowButton?: boolean;
  showDelete?: boolean;

  showFeatureName?: boolean;
  showTitle?: boolean;
  showSeparator?: boolean;

  // Mode selection props
  viewMode?: "viewer" | "executor" | "reviewer";
  onViewModeChange?: (mode: "viewer" | "executor" | "reviewer") => void;
  showModeSelector?: boolean;
}

export function Header({
  handleClose,
  isLoading,
  criticality,
  handleCriticalityChange,
  featureName,
  title,
  onDelete,
  onSync,
  tcueData,
  showFlowViewer,
  showBack = true,
  showShare = true,
  showCriticality = true,
  showSync = true,
  showFlowButton = true,
  showDelete = true,
  showFeatureName = true,
  showTitle = true,
  showSeparator = true,
  viewMode = "viewer",
  onViewModeChange,
  showModeSelector = false,
}: HeaderProps) {
  const isDisabled = isLoading.status;
  const { user } = useUser();
  const userOrgId = user?.publicMetadata?.organisation_id as string | undefined;
  const isQaiUser = isQaiOrgUser(userOrgId) || isQaiOrgAnalystUser(userOrgId);

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b bg-white px-4 py-4 sm:px-6">
      <div className="flex items-center gap-4 min-w-0 flex-1">
        {showBack && (
          <Button
            variant="link"
            onClick={handleClose}
            className="flex items-center gap-2 text-purple-600 hover:text-purple-700 w-[120px] h-[40px] py-3 px-4 gap-x-2 rounded-[--radius-button] opacity-100 shrink-0"
            disabled={isLoading.status && isLoading.action !== "uploading"}
          >
            <ChevronLeft className="h-5 w-5" />
            <span className="font-instrument font-normal text-[14px] leading-[16px]">
              Back
            </span>
          </Button>
        )}

        <div className="flex items-center min-w-0 flex-1 gap-4 opacity-100">
          <div className="flex items-center gap-2 min-w-0">
            {showFeatureName && (
              <h1 className="font-instrument text-[18px] sm:text-[24px] font-bold leading-[18px] sm:leading-[24px] tracking-[-0.01em] align-middle tabular-nums lining-nums truncate">
                {featureName || "Test Case Under Execution Details"}
              </h1>
            )}
            {showSeparator && showFeatureName && showTitle && (
              <div className="h-6 sm:h-10 border-l-2 border-gray-300 mx-2 sm:mx-4 shrink-0"></div>
            )}
            {showTitle && (
              <h2 className="font-instrument text-[18px] sm:text-[24px] font-normal leading-[18px] sm:leading-[24px] tracking-[-0.01em] align-middle tabular-nums lining-nums text-gray-600 truncate">
                {title}
              </h2>
            )}
          </div>
          {showCriticality && (
            <div className="shrink-0">
              <CriticalitySelect
                value={criticality}
                onValueChange={handleCriticalityChange}
                disabled={isDisabled || !isQaiUser}
              />
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {showSync && onSync && isQaiUser && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-black hover:bg-gray-50 hover:text-gray-700"
            onClick={onSync}
            disabled={isDisabled}
            title="Get latest changes"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        )}

        {showModeSelector && onViewModeChange && (
          <Select value={viewMode} onValueChange={onViewModeChange}>
            <SelectTrigger className="w-[120px] sm:w-[140px] h-[40px] rounded-[8px] border border-[#6B6A6A] bg-transparent">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="viewer">
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  <span className="hidden sm:inline">Viewer</span>
                </div>
              </SelectItem>
              <SelectItem value="executor">
                <div className="flex items-center gap-2">
                  <Play className="h-4 w-4" />
                  <span className="hidden sm:inline">Executor</span>
                </div>
              </SelectItem>
              <SelectItem value="reviewer">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4" />
                  <span className="hidden sm:inline">Reviewer</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        )}

        {showFlowButton &&
          tcueData?.metadata &&
          (() => {
            try {
              const metadata = JSON.parse(tcueData.metadata);
              return (
                metadata.flow_json &&
                metadata.tc_graph_json && (
                  <Button
                    variant="outline"
                    size="icon"
                    className="flex items-center gap-2 h-[40px] rounded-[8px] border border-[#6B6A6A] bg-transparent"
                    onClick={showFlowViewer}
                    title="View Flow"
                    disabled={isDisabled}
                  >
                    <Workflow className="h-4 w-4" />
                  </Button>
                )
              );
            } catch (error) {
              return null;
            }
          })()}

        {showDelete && onDelete && isQaiUser && (
          <Button
            variant="outline"
            className="flex items-center gap-1 sm:gap-2 h-[40px] rounded-[8px] border-[#6B6A6A] bg-transparent px-2 sm:px-3"
            onClick={onDelete}
            disabled={isDisabled}
          >
            <Trash2 className="h-4 w-4" />
            <span className="hidden sm:inline">Delete Test</span>
          </Button>
        )}

        {showShare && (
          <Button
            variant="outline"
            className="flex items-center gap-1 sm:gap-2 h-[40px] rounded-[8px] border border-[#6B6A6A] bg-transparent px-2 sm:px-3"
            onClick={() => {
              navigator.clipboard.writeText(window.location.href);
              toast.success("Test case under execution link copied");
            }}
            disabled={isDisabled}
          >
            <Share2 className="h-4 w-4" />
            <span className="hidden sm:inline">Share Test</span>
          </Button>
        )}
      </div>
    </header>
  );
}
