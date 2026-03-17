import { SESSION_TOKEN_COOKIE_NAME } from "@/lib/constants";
import { handleExpiredSessionToken } from "@/lib/handleExpiredSessionToken";
import { constructUrl } from "@/lib/urlUtlis";
import { type NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

export async function DELETE(req: NextRequest) {
  try {
    const { test_case_ids } = await req.json();

    if (
      !test_case_ids ||
      !Array.isArray(test_case_ids) ||
      test_case_ids.length === 0
    ) {
      Sentry.captureMessage(
        "Test case IDs array is required and must not be empty",
        {
          level: "fatal",
          tags: { priority: "high" },
        },
      );
      return NextResponse.json(
        { error: "Test case IDs array is required and must not be empty" },
        { status: 400 },
      );
    }

    const response = await fetch(constructUrl("DeleteTestCase"), {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `${req.cookies.get(SESSION_TOKEN_COOKIE_NAME)?.value}`,
      },
      body: JSON.stringify({ test_case_ids }),
    });

    if (response.status === 401) {
      return await handleExpiredSessionToken(req);
    }

    if (!response.ok) {
      const errorText = await response.text();
      Sentry.captureMessage(errorText, {
        level: "fatal",
        tags: { priority: "high" },
      });
      console.error("Backend error:", errorText);
      throw new Error(`Backend returned ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    console.log("Deleted test cases", result);
    return NextResponse.json(result);
  } catch (error) {
    console.log("Error while deleting test cases: ", error);
    Sentry.captureException(error, {
      level: "fatal",
      tags: { priority: "high" },
    });
    return NextResponse.json(
      { error: "Failed to delete test cases" },
      { status: 500 },
    );
  }
}
