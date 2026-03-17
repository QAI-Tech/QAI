import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import {
  HTTP_STATUS_OK,
  SESSION_TOKEN_COOKIE_NAME,
  HTTP_STATUS_INTERNAL_SERVER_ERROR,
} from "@/lib/constants";
import { handleExpiredSessionToken } from "@/lib/handleExpiredSessionToken";
import { constructUrl } from "@/lib/urlUtlis";

export async function POST(req: NextRequest) {
  try {
    const { product_id, test_run_id, flow_ids } = await req.json();

    const requestBody = {
      product_id,
      test_run_id,
      flow_ids,
    };

    const backendResponse = await fetch(
      constructUrl("AddFlowsToExistingTestRun"),
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
    console.log("Flows added to test run successfully", result);
    return NextResponse.json(result, { status: HTTP_STATUS_OK });
  } catch (error) {
    Sentry.captureException(error, {
      level: "fatal",
      tags: { priority: "high" },
    });
    console.error("Error in POST /api/add-flows-to-existing-test-run:", error);
    return NextResponse.json(
      { error: "Failed to add flows to existing test run" },
      { status: HTTP_STATUS_INTERNAL_SERVER_ERROR },
    );
  }
}
