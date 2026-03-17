import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import {
  HTTP_STATUS_OK,
  SESSION_TOKEN_COOKIE_NAME,
  HTTP_STATUS_BAD_REQUEST,
  HTTP_STATUS_INTERNAL_SERVER_ERROR,
} from "@/lib/constants";
import { handleExpiredSessionToken } from "@/lib/handleExpiredSessionToken";
import { constructUrl } from "@/lib/urlUtlis";

export async function POST(req: NextRequest) {
  try {
    const { test_run_id, test_case_ids } = await req.json();
    console.log("Received request body:", { test_run_id, test_case_ids }); // Debug log

    if (!test_run_id) {
      console.log("Test run ID is missing");
      Sentry.captureMessage("Test run ID is missing", {
        level: "fatal", // or "error"
        tags: { priority: "high" },
      });
      return NextResponse.json(
        { error: "Test run ID is missing" },
        { status: HTTP_STATUS_BAD_REQUEST },
      );
    }

    // Only validate test_case_ids if they are provided
    if (
      test_case_ids !== undefined &&
      (!Array.isArray(test_case_ids) || test_case_ids.length === 0)
    ) {
      console.log("Test case IDs are invalid");
      return NextResponse.json(
        { error: "Test case IDs must be a non-empty array when provided" },
        { status: HTTP_STATUS_BAD_REQUEST },
      );
    }

    const requestBody: { test_run_id: string; test_case_ids?: string[] } = {
      test_run_id,
    };
    if (test_case_ids) {
      requestBody.test_case_ids = test_case_ids;
    }

    const backendResponse = await fetch(
      constructUrl("AddNewTestCasesToTestRun"),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `${req.cookies.get(SESSION_TOKEN_COOKIE_NAME)?.value}`,
        },
        body: JSON.stringify(requestBody),
      },
    );

    if (backendResponse.status === 401) {
      return await handleExpiredSessionToken(req);
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

    const result = await backendResponse.json();
    console.log("New test cases added to test runs successfully", result);
    return NextResponse.json(result, { status: HTTP_STATUS_OK });
  } catch (error) {
    Sentry.captureException(error, {
      level: "fatal",
      tags: { priority: "high" },
    });
    console.error("Error in POST /api/add-new-test-cases-to-test-run:", error);
    return NextResponse.json(
      { error: "Failed to add new test cases to test run" },
      { status: HTTP_STATUS_INTERNAL_SERVER_ERROR },
    );
  }
}
