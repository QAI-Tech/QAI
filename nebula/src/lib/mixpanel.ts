import mixpanel from "mixpanel-browser";
import * as Sentry from "@sentry/nextjs";

// Track initialization state
let isMixpanelInitialized = false;

// Helper function to log Mixpanel errors to both console and Sentry
const logMixpanelError = (
  error: unknown,
  context?: Record<string, unknown>,
) => {
  console.error("[Mixpanel Error]", error);
  if (typeof window !== "undefined") {
    Sentry.captureException(error, {
      level: "error",
      tags: { component: "mixpanel" },
      extra: context,
    });
  }
};

const initMixpanel = () => {
  if (typeof window !== "undefined") {
    try {
      const env = process.env.NEXT_PUBLIC_APP_ENV;
      console.log("[Mixpanel Debug] Environment:", env);

      const token =
        env === "production"
          ? process.env.NEXT_PUBLIC_MIXPANEL_TOKEN_PROD
          : process.env.NEXT_PUBLIC_MIXPANEL_TOKEN_STAGING;

      console.log("[Mixpanel Debug] Token available:", !!token);

      if (!token) {
        console.error(
          `[Mixpanel Error] Mixpanel token is missing for environment: ${env}`,
        );
        return;
      }

      mixpanel.init(token, {
        autocapture: false,
        api_host: "https://api-eu.mixpanel.com",
        debug: false,
      });

      isMixpanelInitialized = true;
      console.log("[Mixpanel Debug] Mixpanel initialized successfully");
    } catch (error) {
      logMixpanelError(error, { context: "initialization" });
      isMixpanelInitialized = false;
    }
  }
};

// Initialize when this module loads
initMixpanel();

// Function to check if tracking should be skipped for this email
const shouldSkipTracking = (
  properties?: Record<string, MixpanelPropertyValue>,
): boolean => {
  // Skip tracking for internal email id's
  if (properties && properties.email && typeof properties.email === "string") {
    return properties.email.toLowerCase().endsWith("@qaitech.ai");
  }
  return false;
};

type MixpanelPropertyValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | string[]
  | number[]
  | boolean[]
  | { [key: string]: MixpanelPropertyValue }
  | object;

// Export tracking functions
export const track = (
  eventName: string,
  properties?: Record<string, MixpanelPropertyValue>,
) => {
  if (typeof window !== "undefined") {
    try {
      // Check if Mixpanel is properly initialized
      if (!isMixpanelInitialized) {
        console.log("[Mixpanel Debug] Not initialized, trying again...");
        initMixpanel();

        if (!isMixpanelInitialized) {
          console.error(
            "[Mixpanel Error] Failed to initialize Mixpanel before tracking event",
          );
          logMixpanelError(
            new Error(
              `Failed to initialize Mixpanel before tracking ${eventName}`,
            ),
            { eventName },
          );
          return false;
        }
      }

      // Add environment data to all events
      const enhancedProps = {
        ...properties,
        environment: process.env.NEXT_PUBLIC_APP_ENV,
        hostname: window.location.hostname,
        timestamp: new Date().toISOString(),
      };

      // Skip tracking for QAI email addresses
      if (shouldSkipTracking(enhancedProps)) {
        console.log(
          `[Mixpanel Debug] Skipping tracking for event ${eventName} - QAI email detected`,
        );
        return true;
      }

      // Safely check if mixpanel has the track method
      if (typeof mixpanel.track !== "function") {
        console.error(
          "[Mixpanel Error] Mixpanel object doesn't have track method",
        );
        logMixpanelError(
          new Error(
            `Mixpanel track method not available for event ${eventName}`,
          ),
          { eventName },
        );
        return false;
      }

      mixpanel.track(eventName, enhancedProps);
      console.log(`[Mixpanel Debug] Event "${eventName}" tracked successfully`);
      return true;
    } catch (error) {
      console.error(
        `[Mixpanel Error] Failed to track event ${eventName}:`,
        error,
      );
      return false;
    }
  }
  return false;
};

export const identify = (
  userId: string,
  userProperties?: Record<string, MixpanelPropertyValue>,
) => {
  if (typeof window !== "undefined") {
    try {
      // Check if Mixpanel is properly initialized
      if (!isMixpanelInitialized) {
        console.log(
          "[Mixpanel Debug] Not initialized, trying again before identify...",
        );
        initMixpanel();

        if (!isMixpanelInitialized) {
          console.error(
            "[Mixpanel Error] Failed to initialize Mixpanel before identify",
          );
          return false;
        }
      }

      // Skip identification for @qaitech.ai email addresses
      if (shouldSkipTracking(userProperties)) {
        console.log(
          `[Mixpanel Debug] Skipping identification for ${userId} - QAI email detected`,
        );
        return true;
      }

      mixpanel.identify(userId);

      // If user properties are provided, set them
      if (userProperties) {
        mixpanel.people.set(userProperties);
      }

      console.log("[Mixpanel Debug] User identified successfully");
      return true;
    } catch (error) {
      console.error(`[Mixpanel Error] Failed to identify user:`, error);
      logMixpanelError(error, {
        userId,
        context: "identification",
      });
      return false;
    }
  }
  return false;
};

// Add function to verify Mixpanel setup
export const verifyMixpanelSetup = () => {
  if (typeof window !== "undefined") {
    try {
      const env = process.env.NEXT_PUBLIC_APP_ENV;
      const token =
        env === "production"
          ? process.env.NEXT_PUBLIC_MIXPANEL_TOKEN_PROD
          : process.env.NEXT_PUBLIC_MIXPANEL_TOKEN_STAGING;

      console.log("[Mixpanel Verification] Current environment:", env);
      console.log("[Mixpanel Verification] Token available:", !!token);
      console.log(
        "[Mixpanel Verification] Mixpanel initialized:",
        isMixpanelInitialized,
      );

      return {
        success:
          isMixpanelInitialized &&
          !!token &&
          typeof mixpanel.track === "function",
        environment: env,
        hasToken: !!token,
        isMixpanelInitialized: isMixpanelInitialized,
      };
    } catch (error) {
      logMixpanelError(error, { context: "verification" });
      return {
        success: false,
        error: String(error),
      };
    }
  }
  return { success: false, error: "Not in browser environment" };
};

const MixpanelService = {
  track,
  identify,
  verifyMixpanelSetup,
};

export default MixpanelService;
