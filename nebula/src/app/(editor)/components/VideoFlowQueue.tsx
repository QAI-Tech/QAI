import React, { useState } from "react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { VideoFlowQueueItem } from "@/app/store/videoFlowQueueSlice";

interface VideoFlowQueueProps {
  items: VideoFlowQueueItem[];
}

export const VideoFlowQueue: React.FC<VideoFlowQueueProps> = ({ items }) => {
  const [isOpen, setIsOpen] = useState(true);

  if (!items || items.length === 0) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="space-y-2">
      <CollapsibleTrigger className="flex items-center gap-2 w-full text-left hover:bg-muted/50 rounded px-1 py-1 transition-colors">
        {isOpen ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
        )}
        <div className="text-xs text-muted-foreground font-medium">
          Video queue ({items.length})
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2">
        <div className="space-y-2 max-h-40 overflow-auto pr-1">
          {items.map((it) => (
            <div
              key={it.id}
              className="border rounded p-2 flex items-center gap-3 bg-muted/30"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate text-sm" title={it.fileName}>
                    {it.fileName}
                  </div>
                  <Badge variant="outline" className="text-[10px]">
                    {it.status}
                  </Badge>
                </div>
                <div className="mt-1">
                  <Progress value={Math.round(it.progress)} className="h-1.5" />
                </div>
                {it.error && (
                  <div className="text-[10px] text-destructive mt-1 truncate">
                    {it.error}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};
