"use client";

import { Button } from "@/components/ui/button";
import { Play, Pause, RotateCcw, RotateCw, Maximize2 } from "lucide-react";

interface VideoControlsProps {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  playbackSpeed: number;
  isDisabled: boolean;
  executionTime?: string;
  onPlayPause: () => void;
  onBackward: () => void;
  onForward: () => void;
  onSpeedChange: (speed: number) => void;
  onFullscreen: () => void;
  onSeek: (e: React.MouseEvent<HTMLDivElement>) => void;
}

export const VideoControls = ({
  currentTime,
  duration,
  isPlaying,
  playbackSpeed,
  isDisabled,
  executionTime,
  onPlayPause,
  onBackward,
  onForward,
  onSpeedChange,
  onFullscreen,
  onSeek,
}: VideoControlsProps) => {
  const formatTime = (timeInSeconds: number): string => {
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  };

  return (
    <>
      <div className="w-full px-4 py-2">
        <div
          className="h-1.5 bg-gray-500 rounded-full cursor-pointer"
          onClick={onSeek}
        >
          <div
            className="relative h-full bg-purple-600 rounded-full"
            style={{
              width: duration > 0 ? `${(currentTime / duration) * 100}%` : "0%",
            }}
          >
            <div className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 bg-purple-600 rounded-full shadow-sm" />
          </div>
        </div>
      </div>
      <div className="px-4 py-2">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center">
            <div className="flex items-center space-x-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={onBackward}
                className="text-black hover:text-black/80 h-8 w-8"
                disabled={isDisabled}
                title="Backward 10 seconds"
              >
                <RotateCcw className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={onPlayPause}
                className="text-black hover:text-black/80 h-8 w-8"
                disabled={isDisabled}
              >
                {isPlaying ? (
                  <Pause className="w-5 h-5" />
                ) : (
                  <Play className="w-5 h-5 fill-current stroke-[1.5]" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={onForward}
                className="text-black hover:text-black/80 h-8 w-8"
                disabled={isDisabled}
              >
                <RotateCw className="w-4 h-4" />
              </Button>
              <span className="text-sm text-black ml-3">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onSpeedChange(playbackSpeed === 1 ? 2 : 1)}
              className="text-black hover:text-black/80 h-8"
              disabled={isDisabled}
            >
              {playbackSpeed}x
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onFullscreen}
              className="text-black hover:text-black/80 h-8 w-8"
              disabled={isDisabled}
            >
              <Maximize2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
        {executionTime && (
          <div className="text-sm text-gray-500 mt-2">
            Executed on {executionTime}
          </div>
        )}
      </div>
    </>
  );
};
