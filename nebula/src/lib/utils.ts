import type React from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { GCS_BUCKET_URL, MAX_VIDEO_DURATION_SECONDS } from "./constants";
import { ProductSwitcherSchema } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Converts a Google Cloud Storage URI to a public URL
 * @param uri The GCS URI to convert (e.g., "gs://bucket/path")
 * @returns The public URL for the resource
 */
export function convertGcsUriToUrl(uri: string): string {
  if (uri.startsWith("gs://")) {
    return GCS_BUCKET_URL + uri.replace("gs://", "");
  }
  return uri;
}

export function decodeString(encodedString: string): string {
  return Buffer.from(encodedString, "base64").toString();
}

/**
 * Common validation method that accepts a regex pattern and value
 * @param regex The regular expression pattern to test against
 * @param value The value to validate
 * @returns true if value matches the regex pattern, false otherwise
 */
export function validateInput(regex: RegExp, value: string): boolean {
  if (typeof value !== "string") {
    return false;
  }
  return regex.test(value.trim());
}

export const ValidationPatterns = {
  // General Name Fields: 1-1000 characters, allows all characters including special characters
  generalName: /^[\s\S]{1,1000}$/,

  // Play Store URL: Includes https, play, google, .com, and id
  playStoreUrl:
    /^https:\/\/play\.google\.com\/store\/apps\/details\?id=[\w.]+(?:&[^=&]+=[^&]+)*$/,

  // App Store URL: App Store link pattern
  appStoreUrl:
    /^https:\/\/(?:apps\.apple\.com|itunes\.apple\.com)\/(?:[a-z]{2}\/)?app\/[\w-]+\/id\d+(?:\?.*)?$/,

  // Web URL: HTTP/HTTPS URL enforcement
  webUrl:
    /^https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,63}\b(?:[-a-zA-Z0-9()@:%_+./~#?&=]*)$/,

  // Requirements Minimum 1 character, no max limit
  optionalText: /^[\s\S]+$/,

  // Email validation pattern
  email: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
} as const;

export const ValidationHelpers = {
  isValidGeneralName: (value: string): boolean =>
    validateInput(ValidationPatterns.generalName, value),

  isValidPlayStoreUrl: (value: string): boolean =>
    validateInput(ValidationPatterns.playStoreUrl, value),

  isValidAppStoreUrl: (value: string): boolean =>
    validateInput(ValidationPatterns.appStoreUrl, value),

  isValidWebUrl: (value: string): boolean =>
    validateInput(ValidationPatterns.webUrl, value),

  isValidOptionalText: (value: string): boolean =>
    validateInput(ValidationPatterns.optionalText, value),

  isValidEmail: (value: string): boolean =>
    validateInput(ValidationPatterns.email, value),

  normalizeUrl: (url: string): string => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      return trimmedUrl;
    }

    if (!trimmedUrl.match(/^https?:\/\//i)) {
      return `https://${trimmedUrl}`;
    }
    return trimmedUrl;
  },
} as const;

// Type definition for validation results

export type ValidationResult = {
  isValid: boolean;
  errorMessage?: string;
};

/**
 * Enhanced validation function that returns detailed validation results
 * @param regex The regular expression pattern to test against
 * @param value The value to validate
 * @param errorMessage Optional custom error message
 * @returns ValidationResult object with isValid boolean and optional error message
 */
export function validateInputWithMessage(
  regex: RegExp,
  value: string,
  errorMessage?: string,
): ValidationResult {
  const isValid = validateInput(regex, value);
  return {
    isValid,
    errorMessage: isValid ? undefined : errorMessage || "Invalid input format",
  };
}

/**
 * Checks if a drag event should be prevented based on the event target
 * Prevents dragging when the event originates from editable elements like inputs, textareas, or contentEditable elements
 * @param event The drag event to check
 * @param preventDefault Whether to automatically call preventDefault if dragging should be prevented (default: true)
 * @returns true if dragging should be prevented, false otherwise
 */
export function shouldPreventDrag(
  event: React.DragEvent,
  preventDefault = true,
): boolean {
  const target = event.target as HTMLElement;
  const shouldPrevent =
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.isContentEditable;

  if (shouldPrevent && preventDefault) {
    event.preventDefault();
  }

  return shouldPrevent;
}

/**
 * Utility function to handle mouse down events for draggable elements
 * Dynamically sets the draggable attribute based on whether the target is an editable element
 * @param event The mouse event
 * @param shouldBeDraggable Whether the element should be draggable when not clicking on editable elements
 */
export function handleDraggableMouseDown(
  event: React.MouseEvent,
  shouldBeDraggable: boolean,
): void {
  const target = event.target as HTMLElement;
  const isEditableElement =
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.isContentEditable;

  const currentTarget = event.currentTarget as HTMLElement;
  currentTarget.draggable = isEditableElement ? false : shouldBeDraggable;
}

/**
 * Auto-detect parameters from test case content (supports both single and double braces)
 * Ordering rule:
 *  1) Parameters found in preconditions (in order)
 *  2) Parameters found in steps: step description then expected results, step-by-step (in order)
 *  3) Parameters found in description (in order)
 * Deduplicated by first occurrence.
 * @param testCase The test case schema to extract parameters from
 * @returns Array of detected parameter placeholders in the required order
 */
export function detectTestCaseParameters(testCase: {
  test_case_description?: string;
  preconditions?: string[];
  test_case_steps?: Array<{
    step_description: string;
    expected_results: string[];
  }>;
}): string[] {
  const parameterPattern = /\{(\{?)([^}]+)\}(\}?)/g;
  const seen = new Set<string>();
  const ordered: string[] = [];

  const collectFromText = (text: string) => {
    if (typeof text !== "string") {
      return;
    }
    const matches = Array.from(text.matchAll(parameterPattern));
    for (const match of matches) {
      const fullMatch = match[0];
      if (!seen.has(fullMatch)) {
        seen.add(fullMatch);
        ordered.push(fullMatch);
      }
    }
  };

  if (Array.isArray(testCase.preconditions)) {
    for (const precondition of testCase.preconditions) {
      if (precondition) {
        collectFromText(precondition);
      }
    }
  }

  if (Array.isArray(testCase.test_case_steps)) {
    for (const step of testCase.test_case_steps) {
      if (step) {
        collectFromText(step.step_description);
      }
      if (Array.isArray(step?.expected_results)) {
        for (const result of step.expected_results) {
          if (result) {
            collectFromText(result);
          }
        }
      }
    }
  }

  if (testCase.test_case_description) {
    collectFromText(testCase.test_case_description);
  }

  return ordered;
}

export function isIOSProduct(product: ProductSwitcherSchema): boolean {
  return !!(
    product.apple_app_store_url && product.apple_app_store_url.trim() !== ""
  );
}

export function isAndroidProduct(product: ProductSwitcherSchema): boolean {
  return !!(
    product.google_play_store_url && product.google_play_store_url.trim() !== ""
  );
}

export function isWebProduct(product: ProductSwitcherSchema): boolean {
  return !!(product.web_url && product.web_url.trim() !== "");
}

export function isMobileProduct(product: ProductSwitcherSchema): boolean {
  return isIOSProduct(product) || isAndroidProduct(product);
}

export function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";

    video.onloadedmetadata = () => {
      window.URL.revokeObjectURL(video.src);
      resolve(video.duration);
    };

    video.onerror = () => {
      window.URL.revokeObjectURL(video.src);
      reject(new Error("Failed to load video metadata"));
    };

    video.src = URL.createObjectURL(file);
  });
}

export async function validateVideoDuration(
  file: File,
): Promise<{ isValid: boolean; errorMessage?: string; duration?: number }> {
  try {
    const duration = await getVideoDuration(file);
    if (duration > MAX_VIDEO_DURATION_SECONDS) {
      return {
        isValid: false,
        errorMessage: `${file.name} exceeds the maximum duration of 3.5 minutes (${Math.round(duration)}s). Please upload a shorter video.`,
        duration,
      };
    }
    return { isValid: true, duration };
  } catch (error) {
    return {
      isValid: false,
      errorMessage: `Could not read duration for ${file.name}. ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}
