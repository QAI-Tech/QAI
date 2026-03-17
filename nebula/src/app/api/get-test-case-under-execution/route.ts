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
    const testRunId = Number(request.nextUrl.searchParams.get("testRunId"));
    console.log(testRunId);
    // Validate testRunId
    if (!testRunId) {
      Sentry.captureMessage("testRunId is required", {
        level: "fatal",
        tags: { priority: "high" },
      });
      return NextResponse.json(
        { error: "testRunId is required" },
        { status: HTTP_STATUS_BAD_REQUEST },
      );
    }

    // Call your backend API
    const backendResponse = await fetch(
      // Need to change this to testRunUnderExecution
      constructUrl(`GetTestCasesUnderExecution?test_run_id=${testRunId}`),
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

    const testRunUnderExecution = await backendResponse.json();

    // Check if test cases are found
    if (!testRunUnderExecution || !testRunUnderExecution.test_cases) {
      return NextResponse.json(
        { error: "No test run found for this testRunId." },
        { status: HTTP_STATUS_NOT_FOUND },
      );
    }

    // Return the test cases
    return NextResponse.json(testRunUnderExecution.test_cases, {
      status: HTTP_STATUS_OK,
    });
  } catch (error) {
    console.error("Error in GET /api/get-test-case-under-execution:", error);
    Sentry.captureException(error, {
      level: "fatal",
      tags: { priority: "high" },
    });
    return NextResponse.json(
      { error: "Failed to get test run under execution" },
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
