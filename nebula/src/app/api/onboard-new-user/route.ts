import {
  HTTP_STATUS_INTERNAL_SERVER_ERROR,
  SESSION_TOKEN_COOKIE_NAME,
  HTTP_STATUS_BAD_REQUEST,
} from "@/lib/constants";
import { handleExpiredSessionToken } from "@/lib/handleExpiredSessionToken";
import { constructUrl } from "@/lib/urlUtlis";
import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

// Define proper types for the request body
interface OnboardNewUserRequest {
  firstName: string;
  lastName: string;
  email: string;
  organization_name?: string;
  organisation_id?: string;
  product_name?: string;
  web_url?: string;
  google_play_store_url?: string;
  apple_app_store_url?: string;
  invite_org_id?: string;
  roles?: string[];
  default_credentials?: {
    credentials: Record<string, string>;
    description: string;
    is_default: boolean;
  };
}

export async function POST(req: NextRequest) {
  try {
    // Extract request body
    const body = await req.json();
    const {
      firstName,
      lastName,
      email,
      organization_name,
      organisation_id,
      product_name,
      web_url,
      google_play_store_url,
      apple_app_store_url,
      invite_org_id,
      roles,
      default_credentials,
    } = body as OnboardNewUserRequest;

    // Validate required fields
    if (!firstName || !lastName) {
      console.log("Missing required fields for onboarding");
      return NextResponse.json(
        { error: "Missing required fields for onboarding" },
        { status: HTTP_STATUS_BAD_REQUEST },
      );
    }

    const effectiveOrgId = invite_org_id || organisation_id;
    if (!effectiveOrgId && (!organization_name || !product_name)) {
      console.log("Missing organization details for onboarding");
      Sentry.captureMessage(
        JSON.stringify("Missing organization details for onboarding"),
        {
          level: "fatal",
          tags: { priority: "high" },
        },
      );
      return NextResponse.json(
        { error: "Missing organization details for onboarding" },
        { status: HTTP_STATUS_BAD_REQUEST },
      );
    }

    const backendResponse = await fetch(constructUrl("OnboardNewUser"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `${req.cookies.get(SESSION_TOKEN_COOKIE_NAME)?.value}`,
      },
      body: JSON.stringify({
        first_name: firstName,
        last_name: lastName,
        email: email,
        roles: roles || ["Tester"],
        ...(effectiveOrgId
          ? { organisation_id: effectiveOrgId }
          : {
              organisation_name: organization_name,
              product_name: product_name,
              web_url: web_url || "",
              google_play_store_url: google_play_store_url || "",
              apple_app_store_url: apple_app_store_url || "",
              default_credentials: default_credentials || null,
            }),
      }),
    });

    if (backendResponse.status === 401) {
      return await handleExpiredSessionToken(req);
    }

    if (!backendResponse.ok) {
      const errorData = await backendResponse.json();
      Sentry.captureMessage(JSON.stringify(errorData), {
        level: "fatal",
        tags: { priority: "high" },
      });
      return NextResponse.json(
        { error: errorData.error || "Backend request failed" },
        { status: backendResponse.status },
      );
    }

    const result = await backendResponse.json();

    console.log("User onboarded successfully:", result);
    return NextResponse.json(result);
  } catch (error) {
    Sentry.captureException(error, {
      level: "fatal",
      tags: { priority: "high" },
    });
    console.error("Error in POST /api/onboard-new-user:", error);
    return NextResponse.json(
      { error: "Failed to onboard user" },
      { status: HTTP_STATUS_INTERNAL_SERVER_ERROR },
    );
  }
}
