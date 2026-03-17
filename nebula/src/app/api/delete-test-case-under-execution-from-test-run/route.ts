import { SESSION_TOKEN_COOKIE_NAME } from "@/lib/constants";
import { handleExpiredSessionToken } from "@/lib/handleExpiredSessionToken";
import { constructUrl } from "@/lib/urlUtlis";
import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

export async function DELETE(req: NextRequest) {
  try {
    const { test_case_under_execution_ids } = await req.json();

    if (
      !test_case_under_execution_ids ||
      !Array.isArray(test_case_under_execution_ids) ||
      test_case_under_execution_ids.length === 0
    ) {
      Sentry.captureMessage(
        "Test case under execution IDs array is required and must not be empty",
        {
          level: "fatal",
          tags: { priority: "high" },
        },
      );
      return NextResponse.json(
        {
          error:
            "Test case under execution IDs array is required and must not be empty",
        },
        { status: 400 },
      );
    }

    const response = await fetch(
      constructUrl("DeleteTestCaseUnderExecutionFromTestRun"),
      {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `${req.cookies.get(SESSION_TOKEN_COOKIE_NAME)?.value}`,
        },
        body: JSON.stringify({ test_case_under_execution_ids }),
      },
    );

    if (response.status === 401) {
      return await handleExpiredSessionToken(req);
    }

    if (!response.ok) {
      const errorData = await response.json();
      Sentry.captureMessage(JSON.stringify(errorData), {
        level: "fatal",
        tags: { priority: "high" },
      });
      return NextResponse.json(
        { error: errorData.error || "Backend request failed" },
        { status: response.status },
      );
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error) {
    Sentry.captureException(error, {
      level: "fatal",
      tags: { priority: "high" },
    });
    console.error(
      "Error while deleting the test cases under execution: ",
      error,
    );
    return NextResponse.json(
      { error: "Failed to delete TCUE from test run" },
      { status: 500 },
    );
  }
}
