import React from "react";
import { Button } from "@/components/ui/button";
import {
  X,
  Trash2,
  Globe,
  MousePointer,
  Camera,
  ExternalLink,
} from "lucide-react";

interface ElementInfo {
  tagName: string;
  id: string | null;
  className: string | null;
  text: string | null;
  selector: string;
}

interface RecordedAction {
  type: "click" | "scroll" | "type" | "hover" | "focus";
  details: {
    x?: number;
    y?: number;
    pageX?: number;
    pageY?: number;
    deltaX?: number;
    deltaY?: number;
    scrollX?: number;
    scrollY?: number;
    text?: string;
    key?: string;
    element?: ElementInfo;
    clientX?: number;
    clientY?: number;
  };
  timestamp: string;
  time: string;
  url?: string;
  actionCounter?: number;
  before_screenshot?: string;
  after_screenshot?: string;
  screenshot?: string;
}

interface WebRecorderProps {
  isOpen: boolean;
  onClose: () => void;
  actions: RecordedAction[];
  isExtensionConnected: boolean;
  extensionRecording: boolean;
  onClearActions: () => void;
}

export const WebRecorder: React.FC<WebRecorderProps> = ({
  isOpen,
  onClose,
  actions,
  isExtensionConnected,
  extensionRecording,
  onClearActions,
}) => {
  const clearLog = () => {
    onClearActions();
  };

  const exportActions = () => {
    // Export without screenshots to keep file size small
    const exportData = actions.map(({ screenshot, ...rest }) => rest);
    const dataStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `web-recording-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-slate-900 rounded-xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden border border-slate-700">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-cyan-400" />
              <span className="font-semibold text-white">Web Recorder</span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${
                  isExtensionConnected
                    ? extensionRecording
                      ? "bg-green-500 animate-pulse"
                      : "bg-cyan-500"
                    : "bg-red-500"
                }`}
              />
              <span className="text-sm text-slate-400">
                {isExtensionConnected
                  ? extensionRecording
                    ? "Recording via Extension"
                    : "Extension Connected"
                  : "Extension Not Connected"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={exportActions}
              variant="outline"
              size="sm"
              disabled={actions.length === 0}
            >
              Export JSON
            </Button>
            <Button onClick={onClose} variant="ghost" size="icon">
              <X className="w-5 h-5 text-slate-400" />
            </Button>
          </div>
        </div>

        {/* Instructions */}
        {!isExtensionConnected && (
          <div className="p-4 bg-amber-500/10 border-b border-amber-500/20">
            <div className="flex items-start gap-3">
              <ExternalLink className="w-5 h-5 text-amber-400 mt-0.5" />
              <div className="text-sm text-amber-200">
                <p className="font-medium mb-1">
                  Install the QAI Web Recorder Extension
                </p>
                <ol className="list-decimal list-inside space-y-1 text-amber-300/80">
                  <li>
                    Open{" "}
                    <code className="bg-amber-500/20 px-1 rounded">
                      chrome://extensions
                    </code>
                  </li>
                  <li>Enable "Developer mode"</li>
                  <li>
                    Click "Load unpacked" → select{" "}
                    <code className="bg-amber-500/20 px-1 rounded">
                      public/web-recorder-extension
                    </code>
                  </li>
                  <li>Click the extension icon and start recording</li>
                  <li>Navigate to any website and interact with it</li>
                </ol>
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="flex flex-1 min-h-0">
          {/* Action Log with Screenshots */}
          <div className="flex-1 flex flex-col">
            <div className="flex items-center justify-between p-3 border-b border-slate-700">
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-cyan-400" />
                <span className="font-medium text-white">Recorded Actions</span>
                <span className="bg-cyan-500/20 text-cyan-400 text-xs px-2 py-0.5 rounded-full">
                  {actions.length}
                </span>
              </div>
              <Button
                onClick={clearLog}
                variant="ghost"
                size="sm"
                className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                disabled={actions.length === 0}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Clear
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {actions.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-500 text-center p-4">
                  <MousePointer className="w-16 h-16 mb-4 opacity-30" />
                  <p className="text-lg font-medium mb-2">
                    No actions recorded yet
                  </p>
                  <p className="text-sm">
                    {isExtensionConnected
                      ? "Start recording in the extension and interact with any website"
                      : "Install the extension and start recording to capture actions"}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {actions.map((action, index) => (
                    <div
                      key={index}
                      className={`rounded-lg overflow-hidden bg-slate-800/50 border ${
                        action.type === "click"
                          ? "border-purple-500/30"
                          : action.type === "scroll"
                            ? "border-amber-500/30"
                            : action.type === "type"
                              ? "border-green-500/30"
                              : "border-pink-500/30"
                      }`}
                    >
                      {(action.before_screenshot ||
                        action.after_screenshot ||
                        action.screenshot) && (
                        <div className="relative">
                          {action.before_screenshot &&
                          action.after_screenshot ? (
                            <div className="grid grid-cols-2 gap-1">
                              <div className="relative aspect-video bg-slate-900">
                                <img
                                  src={action.before_screenshot}
                                  alt="Before action"
                                  className="w-full h-full object-cover"
                                />
                                <div className="absolute top-1 left-1 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
                                  Before
                                </div>
                              </div>
                              <div className="relative aspect-video bg-slate-900">
                                <img
                                  src={action.after_screenshot}
                                  alt="After action"
                                  className="w-full h-full object-cover"
                                />
                                <div className="absolute top-1 left-1 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
                                  After
                                </div>
                                {action.type === "click" &&
                                  action.details.x &&
                                  action.details.y && (
                                    <div
                                      className="absolute w-6 h-6 border-2 border-red-500 rounded-full bg-red-500/30 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                                      style={{
                                        left: `${(action.details.x / 1920) * 100}%`,
                                        top: `${(action.details.y / 1080) * 100}%`,
                                      }}
                                    />
                                  )}
                              </div>
                            </div>
                          ) : (
                            <div className="relative aspect-video bg-slate-900">
                              <img
                                src={
                                  action.after_screenshot || action.screenshot
                                }
                                alt={`Screenshot for ${action.type}`}
                                className="w-full h-full object-cover"
                              />
                              {action.type === "click" &&
                                action.details.x &&
                                action.details.y && (
                                  <div
                                    className="absolute w-6 h-6 border-2 border-red-500 rounded-full bg-red-500/30 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                                    style={{
                                      left: `${(action.details.x / 1920) * 100}%`,
                                      top: `${(action.details.y / 1080) * 100}%`,
                                    }}
                                  />
                                )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Action Details */}
                      <div className="p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span
                            className={`text-xs font-bold uppercase px-2 py-0.5 rounded ${
                              action.type === "click"
                                ? "bg-purple-500/20 text-purple-400"
                                : action.type === "scroll"
                                  ? "bg-amber-500/20 text-amber-400"
                                  : action.type === "type"
                                    ? "bg-green-500/20 text-green-400"
                                    : "bg-pink-500/20 text-pink-400"
                            }`}
                          >
                            {action.type}
                          </span>
                          <div className="flex items-center gap-2">
                            {action.actionCounter !== undefined && (
                              <span className="text-xs text-slate-600 bg-slate-700/50 px-1.5 py-0.5 rounded">
                                #{action.actionCounter}
                              </span>
                            )}
                            <span className="text-xs text-slate-500">
                              {action.time}
                            </span>
                          </div>
                        </div>

                        <div className="text-xs text-slate-300 font-mono space-y-1">
                          {action.type === "click" && (
                            <>
                              <div>
                                Position:{" "}
                                <span className="text-cyan-400">
                                  ({action.details.x}, {action.details.y})
                                </span>
                              </div>
                              {action.details.element && (
                                <div className="truncate">
                                  Element:{" "}
                                  <span className="text-cyan-400">
                                    {action.details.element.selector}
                                  </span>
                                </div>
                              )}
                            </>
                          )}
                          {action.type === "scroll" && (
                            <div>
                              Scroll:{" "}
                              <span className="text-cyan-400">
                                ({action.details.scrollX},{" "}
                                {action.details.scrollY})
                              </span>
                            </div>
                          )}
                          {action.type === "type" && (
                            <div className="truncate">
                              Text:{" "}
                              <span className="text-cyan-400">
                                "{action.details.text}"
                              </span>
                            </div>
                          )}
                          {action.url && (
                            <div className="truncate text-slate-500">
                              {new URL(action.url).hostname}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WebRecorder;
