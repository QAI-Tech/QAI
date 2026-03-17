"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, Maximize, Volume2, VolumeX, Crop, Maximize2 } from "lucide-react";

interface VideoPlayerProps {
  src: string;
  className?: string;
  autoPlay?: boolean;
  muted?: boolean;
  fitMode?: "contain" | "cover";
  backgroundColor?: string;
  onTimeUpdate?: (currentTime: number) => void;
  onError?: (error: MediaError | null) => void;
  currentTime?: number;
  poster?: string;
  /**
   * Optional ref to access the underlying <video> element
   * (useful for frame capture / screenshots).
   */
  videoElementRef?: React.MutableRefObject<HTMLVideoElement | null>;
}

export function VideoPlayer({ src, className, autoPlay = false, muted = false, fitMode = "cover", backgroundColor = "black", onTimeUpdate, onError: onVideoError, videoElementRef, currentTime: initialTime, poster}: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(!!muted);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentFitMode, setCurrentFitMode] = useState<"contain" | "cover">(fitMode);
  const [isHovered, setIsHovered] = useState(false);
  const [showControlsInFullscreen, setShowControlsInFullscreen] = useState(true);
  const cursorTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.muted = isMuted;
  }, [isMuted]);

  useEffect(() => {
    if (autoPlay && videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => {});
    }
  }, [autoPlay, src]);

  useEffect(() => {
    if (videoRef.current && initialTime !== undefined) {
      videoRef.current.currentTime = initialTime;
    }
  }, [initialTime, src]);

  useEffect(() => {
    const onFsChange = () => {
      const isFs = document.fullscreenElement === containerRef.current;
      setIsFullscreen(isFs);
      if (isFs) {
        setShowControlsInFullscreen(true);
      }
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // Handle cursor movement in fullscreen
  useEffect(() => {
    if (!isFullscreen) return;

    const handleMouseMove = () => {
      setShowControlsInFullscreen(true);
      
      if (cursorTimeoutRef.current) {
        clearTimeout(cursorTimeoutRef.current);
      }
      
      cursorTimeoutRef.current = setTimeout(() => {
        setShowControlsInFullscreen(false);
      }, 1000); // Hide after 1 second of inactivity
    };

    document.addEventListener('mousemove', handleMouseMove);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      if (cursorTimeoutRef.current) {
        clearTimeout(cursorTimeoutRef.current);
      }
    };
  }, [isFullscreen]);

  const formatTime = useMemo(
    () => (time: number) => {
      if (!time || isNaN(time)) return "0:00";
      const minutes = Math.floor(time / 60);
      const seconds = Math.floor(time % 60)
        .toString()
        .padStart(2, "0");
      return `${minutes}:${seconds}`;
    },
    [],
  );

  const handleSeekBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current || duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickRatio = Math.max(0, Math.min(1, clickX / rect.width));
    const newTime = clickRatio * duration;
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  const toggleRate = () => {
    const next = playbackRate === 1 ? 2 : 1;
    setPlaybackRate(next);
    if (videoRef.current) videoRef.current.playbackRate = next;
  };

  const toggleMute = () => setIsMuted((m) => !m);

  const toggleFitMode = () => {
    setCurrentFitMode((mode) => mode === "cover" ? "contain" : "cover");
  };

  const handleFullscreen = () => {
    if (containerRef.current && containerRef.current.requestFullscreen) {
      containerRef.current.requestFullscreen();
    } else if (videoRef.current && videoRef.current.requestFullscreen) {
      videoRef.current.requestFullscreen();
    }
  };

  const baseClasses = "relative overflow-hidden bg-black portal-container";
  const defaultSize = "w-80 h-full rounded-2xl";
  const fullscreenSize = "w-screen h-screen rounded-none";
  const wrapperClasses = [
    className ? className : `${baseClasses} ${isFullscreen ? fullscreenSize : defaultSize}`,
  ].join(" ");

  return (
    <div 
      ref={containerRef} 
      className={wrapperClasses}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <video
        ref={(el) => {
          videoRef.current = el;
          if (videoElementRef) {
            videoElementRef.current = el;
          }
        }}
        src={src}
        className={`w-full h-full ${currentFitMode === "cover" ? "object-cover" : "object-contain"} bg-${backgroundColor}`}
        preload="metadata"
        muted={isMuted}
        crossOrigin="anonymous"
        poster={poster} 
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={() => {
          if (!videoRef.current) return;
          const t = videoRef.current.currentTime;
          setCurrentTime(t);
          onTimeUpdate?.(t);
        }}
        onLoadedMetadata={() => {
          if (!videoRef.current) return;
          setDuration(videoRef.current.duration || 0);
        }}
        onCanPlayThrough={() => {
          if (!videoRef.current) return;
          setDuration((d) => d || videoRef.current!.duration || 0);
        }}
        onError={(e) => {
          const videoError = e.currentTarget.error;
          let errorMessage = "Failed to load video";
          
          if (videoError) {
            console.error("Video error details:", {
              code: videoError.code,
              message: videoError.message,
              src: e.currentTarget.src
            });
            
            switch (videoError.code) {
              case MediaError.MEDIA_ERR_ABORTED:
                errorMessage = "Video playback was aborted";
                break;
              case MediaError.MEDIA_ERR_NETWORK:
                errorMessage = "Network error occurred while loading video";
                break;
              case MediaError.MEDIA_ERR_DECODE:
                errorMessage = "Video format is not supported";
                break;
              case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
                errorMessage = "Video source is not supported";
                break;
            }
          }
          
          setError(errorMessage);
          onVideoError?.(videoError);
        }}
      />

      <div className={`absolute bottom-0 left-0 right-0 glass-effect rounded-t-xl p-3 space-y-3 transition-opacity duration-300 ${
        isFullscreen 
          ? (showControlsInFullscreen || !isPlaying ? 'opacity-100' : 'opacity-0')
          : (isHovered || !isPlaying ? 'opacity-100' : 'opacity-0')
      }`}>
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-white">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
          <div className="w-full h-1.5 bg-white/30 rounded-full cursor-pointer" onClick={handleSeekBarClick}>
            <div
              className="h-full bg-white rounded-full transition-all duration-150"
              style={{ width: duration > 0 ? `${(currentTime / duration) * 100}%` : "0%" }}
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={togglePlay} className="hover:bg-white/20 text-white">
            {isPlaying ? <Pause size={18} /> : <Play size={18} />}
          </Button>

          <Button variant="ghost" size="sm" onClick={toggleRate} className="hover:bg-white/20 text-white px-3">
            {playbackRate}x
          </Button>

          <Button variant="ghost" size="icon" onClick={toggleMute} className="hover:bg-white/20 text-white">
            {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={toggleFitMode}
            className="hover:bg-white/20 text-white"
            title={currentFitMode === "cover" ? "Show full video" : "Fill frame"}
          >
            {currentFitMode === "cover" ? <Maximize2 size={18} /> : <Crop size={18} />}
          </Button>

          <div className="flex-1" />

          <Button variant="ghost" size="icon" onClick={handleFullscreen} className="hover:bg-white/20 text-white">
            <Maximize size={18} />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default VideoPlayer;

