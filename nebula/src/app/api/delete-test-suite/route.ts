// app/api/delete-test-suite/route.ts

import { SESSION_TOKEN_COOKIE_NAME } from "@/lib/constants";
import { handleExpiredSessionToken } from "@/lib/handleExpiredSessionToken";
import { constructUrl } from "@/lib/urlUtlis";
import { type NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

export async function DELETE(req: NextRequest) {
  try {
    const { test_suite_id } = await req.json();

    if (!test_suite_id) {
      Sentry.captureMessage("Test suite ID is required", {
        level: "fatal",
        tags: { priority: "high" },
      });
      return NextResponse.json(
        { error: "Test suite ID is required" },
        { status: 400 },
      );
    }

    const response = await fetch(constructUrl("DeleteTestSuite"), {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `${req.cookies.get(SESSION_TOKEN_COOKIE_NAME)?.value}`,
      },
      body: JSON.stringify({ test_suite_id }),
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
    console.log("Deleted test suite", result);
    return NextResponse.json(result);
  } catch (error) {
    console.log("Error while deleting test suite: ", error);
    Sentry.captureException(error, {
      level: "fatal",
      tags: { priority: "high" },
    });
    return NextResponse.json(
      { error: "Failed to delete test suite" },
      { status: 500 },
    );
  }
}
