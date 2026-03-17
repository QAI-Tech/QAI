import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { constructUrl } from "@/lib/urlUtlis";
import { handleExpiredSessionToken } from "@/lib/handleExpiredSessionToken";
import {
  SESSION_TOKEN_COOKIE_NAME,
  HTTP_STATUS_BAD_REQUEST,
  HTTP_STATUS_NOT_FOUND,
  HTTP_STATUS_OK,
  HTTP_STATUS_INTERNAL_SERVER_ERROR,
} from "@/lib/constants";
import * as Sentry from "@sentry/nextjs";

export async function GET(request: NextRequest) {
  try {
    // Extract query parameters
    const organisationId = request.nextUrl.searchParams.get("organisation_id");

    // Validate required parameters
    if (!organisationId) {
      Sentry.captureMessage("OrganisationId is required", {
        level: "fatal",
        tags: { priority: "high" },
      });
      return NextResponse.json(
        { error: "organisation_id is required" },
        { status: HTTP_STATUS_BAD_REQUEST },
      );
    }

    // Call backend API
    const backendResponse = await fetch(
      constructUrl(
        `GetUsageDataForOrganisation?organisation_id=${organisationId}`,
      ),
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `${request.cookies.get(SESSION_TOKEN_COOKIE_NAME)?.value}`,
        },
      },
    );

    if (backendResponse.status === 401) {
      return await handleExpiredSessionToken(request);
    }

    // Handle backend response
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

    const usageData = await backendResponse.json();

    // Check if data is found
    if (!usageData || !usageData.data) {
      return NextResponse.json(
        { error: "No usage data found for this organisation." },
        { status: HTTP_STATUS_NOT_FOUND },
      );
    }

    // Return the usage data
    return NextResponse.json(usageData, {
      status: HTTP_STATUS_OK,
    });
  } catch (error) {
    console.error("Error in GET /api/get-usage-data-for-organisation:", error);
    Sentry.captureException(error, {
      level: "fatal",
      tags: { priority: "high" },
    });
    return NextResponse.json(
      { error: "Failed to get usage data for your org" },
      { status: HTTP_STATUS_INTERNAL_SERVER_ERROR },
    );
  }
}

export async function POST() {
  return NextResponse.json(
    { error: "Only GET method is allowed for this endpoint." },
    { status: 405 },
  );
}
