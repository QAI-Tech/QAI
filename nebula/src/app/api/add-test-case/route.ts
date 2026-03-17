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
    const { addTestCaseData } = await req.json();
    if (!addTestCaseData) {
      Sentry.captureMessage("Test Case data is missing", {
        level: "fatal",
        tags: { priority: "high" },
      });
      console.log("Test Case data is missing");
      return NextResponse.json(
        { error: "Test Case data is missing" },
        { status: HTTP_STATUS_BAD_REQUEST },
      );
    }
    const backendResponse = await fetch(constructUrl("AddTestCase"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `${req.cookies.get(SESSION_TOKEN_COOKIE_NAME)?.value}`,
      },
      body: JSON.stringify(addTestCaseData),
    });

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
    console.log("Test Case Added Successfully", result);
    return NextResponse.json(result, { status: HTTP_STATUS_OK });
  } catch (error) {
    Sentry.captureException(error, {
      level: "fatal",
      tags: { priority: "high" },
    });
    console.error("Error in POST /api/add-test-run:", error);
    return NextResponse.json(
      { error: "Failed to add test case" },
      { status: HTTP_STATUS_INTERNAL_SERVER_ERROR },
    );
  }
}
