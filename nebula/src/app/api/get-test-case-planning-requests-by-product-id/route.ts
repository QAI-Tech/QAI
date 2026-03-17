import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
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
    const productId = Number(request.nextUrl.searchParams.get("productId"));
    // Validate testRunId
    if (!productId) {
      Sentry.captureMessage("productId is required", {
        level: "fatal",
        tags: { priority: "high" },
      });
      return NextResponse.json(
        { error: "productId is required" },
        { status: HTTP_STATUS_BAD_REQUEST },
      );
    }

    // Call your backend API
    const backendResponse = await fetch(
      // Need to change this to testRunUnderExecution
      constructUrl(
        `GetTestCasePlanningRequestsByProductId?product_id=${productId}`,
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
      console.log("errorData: ", errorData);
      Sentry.captureMessage(JSON.stringify(errorData), {
        level: "fatal",
        tags: { priority: "high" },
      });
      return NextResponse.json(
        { error: errorData.error || "Backend request failed" },
        { status: backendResponse.status },
      );
    }

    const testCasePlanningRequests = await backendResponse.json();

    // Check if test cases are found
    if (!testCasePlanningRequests) {
      return NextResponse.json(
        { error: "No test case planning requests found for this productId." },
        { status: HTTP_STATUS_NOT_FOUND },
      );
    }

    // Return the test cases
    return NextResponse.json(testCasePlanningRequests, {
      status: HTTP_STATUS_OK,
    });
  } catch (error) {
    console.error(
      "Error in GET /api/get-test-case-planning-requests-by-product-id:",
      error,
    );
    Sentry.captureException(error, {
      level: "fatal",
      tags: { priority: "high" },
    });
    return NextResponse.json(
      { error: "Failed to get test case planning requests" },
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
