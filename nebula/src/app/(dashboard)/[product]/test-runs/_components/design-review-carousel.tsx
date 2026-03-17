"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  XCircle,
  Monitor,
  Smartphone,
  Tablet,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface DesignReviewCarouselProps {
  screens: string[];
}

interface ReviewSlide {
  title: string;
  screenName: string;
  review: string;
  isSummary?: boolean;
}

type Device = "iphone" | "android" | "ipad" | "android-tablet" | "desktop";

const devices: { id: Device; label: string; icon: typeof Smartphone }[] = [
  { id: "iphone", label: "iPhone", icon: Smartphone },
  { id: "android", label: "Android Phone", icon: Smartphone },
  { id: "ipad", label: "iPad", icon: Tablet },
  { id: "android-tablet", label: "Android Tablet", icon: Tablet },
  { id: "desktop", label: "Desktop", icon: Monitor },
];

export function DesignReviewCarousel({ screens }: DesignReviewCarouselProps) {
  const safeScreens = screens.length > 0 ? screens : ["Screen 1"];

  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedDevice, setSelectedDevice] = useState<Device>("iphone");

  // Track status for each screen per device: { deviceId: { screenIndex: status } }
  const [deviceScreenStatuses, setDeviceScreenStatuses] = useState<
    Record<Device, Record<number, "passed" | "failed">>
  >(() => {
    const initial = {} as Record<Device, Record<number, "passed" | "failed">>;
    devices.forEach((device) => {
      initial[device.id] = {};
      safeScreens.forEach((_, index) => {
        initial[device.id][index] = "passed";
      });
    });

    if (safeScreens.length > 0) {
      initial["desktop"][0] = "failed";
    }
    if (safeScreens.length > 1) {
      initial["android"][1] = "failed";
      initial["android-tablet"][1] = "failed";
    }
    return initial;
  });

  // Generate n+1 slides: one per screen + summary at the end
  const slides: ReviewSlide[] = [
    ...safeScreens.map((screenName, index) => ({
      title: `Screen ${index + 1}`,
      screenName: screenName || `Screen ${index + 1}`,
      review: `The ${screenName || `screen ${index + 1}`} follows mobile design best practices with appropriate spacing and typography. The primary action is clearly visible and accessible. Consider reviewing the contrast ratio for secondary elements to ensure WCAG 2.1 AA compliance.`,
    })),
    {
      title: "Summary",
      screenName: "Overall Assessment",
      review:
        "Overall, the flow demonstrates good visual hierarchy and consistent styling. The navigation patterns are intuitive and follow platform conventions. Key recommendations: (1) Ensure touch targets meet 44x44pt minimum, (2) Review color contrast for accessibility, (3) Consider adding loading states for async operations.",
      isSummary: true,
    },
  ];

  const currentSlide = slides[currentIndex];
  const isSummarySlide = currentIndex === slides.length - 1;

  // Get current device's screen statuses
  const currentDeviceStatuses = deviceScreenStatuses[selectedDevice];

  const getDeviceOverallStatus = (deviceId: Device): "passed" | "failed" => {
    const statuses = deviceScreenStatuses[deviceId];
    return Object.values(statuses).some((s) => s === "failed")
      ? "failed"
      : "passed";
  };

  const toggleStatus = (index: number) => {
    setDeviceScreenStatuses((prev) => ({
      ...prev,
      [selectedDevice]: {
        ...prev[selectedDevice],
        [index]: prev[selectedDevice][index] === "passed" ? "failed" : "passed",
      },
    }));
  };

  const goToPrev = () => setCurrentIndex((prev) => Math.max(0, prev - 1));
  const goToNext = () =>
    setCurrentIndex((prev) => Math.min(slides.length - 1, prev + 1));

  return (
    <div className="flex flex-col">
      {/* Device selector */}
      <div className="mb-3">
        <Select
          value={selectedDevice}
          onValueChange={(val) => setSelectedDevice(val as Device)}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {devices.map((device) => {
              const Icon = device.icon;
              const status = getDeviceOverallStatus(device.id);
              return (
                <SelectItem key={device.id} value={device.id}>
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    <span>{device.label}</span>
                    {status === "passed" ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500 ml-auto" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-destructive ml-auto" />
                    )}
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      {/* Navigation controls */}
      <div className="flex items-center justify-center gap-4 mb-3">
        <button
          onClick={goToPrev}
          disabled={currentIndex === 0}
          className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors duration-fast"
        >
          &lt;&lt;
        </button>
        <span className="text-sm font-medium text-foreground">
          {currentIndex + 1} of {slides.length}
        </span>
        <button
          onClick={goToNext}
          disabled={currentIndex === slides.length - 1}
          className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors duration-fast"
        >
          &gt;&gt;
        </button>
      </div>

      {/* Slide content */}
      <motion.div
        key={`${currentIndex}-${selectedDevice}`}
        initial={{ opacity: 0, x: 10 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -10 }}
        transition={{ duration: 0.2 }}
        className="border-2 border-border rounded-lg p-4 flex flex-col gap-3"
      >
        <div className="flex items-center justify-between">
          <span
            className={cn(
              "text-xs font-medium px-2 py-0.5 rounded",
              isSummarySlide
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground",
            )}
          >
            {currentSlide.title}
          </span>

          {!isSummarySlide && (
            <button
              onClick={() => toggleStatus(currentIndex)}
              className={cn(
                "flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded transition-colors",
                currentDeviceStatuses[currentIndex] === "passed"
                  ? "bg-green-500/10 text-green-500 hover:bg-green-500/20"
                  : "bg-destructive/10 text-destructive hover:bg-destructive/20",
              )}
            >
              {currentDeviceStatuses[currentIndex] === "passed" ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Passed
                </>
              ) : (
                <>
                  <XCircle className="h-3.5 w-3.5" />
                  Failed
                </>
              )}
            </button>
          )}
        </div>

        <h3 className="text-base font-medium text-foreground">
          {currentSlide.screenName}
        </h3>

        <div className="space-y-2">
          <span className="text-xs font-medium text-muted-foreground">
            Design Review:
          </span>
          <p className="text-sm text-foreground leading-relaxed">
            {currentSlide.review}
          </p>
        </div>

        {isSummarySlide && (
          <div className="mt-2 pt-3 border-t border-border">
            <span className="text-xs font-medium text-muted-foreground block mb-2">
              Device Status:
            </span>
            <div className="grid grid-cols-2 gap-2">
              {devices.map((device) => {
                const Icon = device.icon;
                const status = getDeviceOverallStatus(device.id);
                return (
                  <div
                    key={device.id}
                    className={cn(
                      "flex items-center gap-2 text-xs px-2 py-1.5 rounded",
                      status === "passed"
                        ? "bg-green-500/10"
                        : "bg-destructive/10",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="flex-1">{device.label}</span>
                    {status === "passed" ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-destructive" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </motion.div>

      {/* Dot indicators */}
      <div className="flex items-center justify-center gap-1.5 mt-3">
        {slides.map((_, index) => (
          <button
            key={index}
            onClick={() => setCurrentIndex(index)}
            className={cn(
              "w-1.5 h-1.5 rounded-full transition-colors duration-fast",
              index === currentIndex
                ? "bg-primary"
                : "bg-muted-foreground/30 hover:bg-muted-foreground/50",
            )}
          />
        ))}
      </div>
    </div>
  );
}
