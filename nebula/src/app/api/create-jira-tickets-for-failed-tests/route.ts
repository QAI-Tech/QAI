import { type NextRequest, NextResponse } from "next/server";
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
    const { product_id, test_run_id, failed_test_case_ids } = await req.json();

    if (!product_id || !test_run_id || !Array.isArray(failed_test_case_ids)) {
      Sentry.captureMessage("Jira ticket creation data is missing or invalid", {
        level: "fatal",
        tags: { priority: "high" },
      });
      console.log("Jira ticket creation data is missing or invalid");
      return NextResponse.json(
        {
          error:
            "Product ID, test run ID, and failed test case IDs are required",
        },
        { status: HTTP_STATUS_BAD_REQUEST },
      );
    }

    const jiraTicketData = {
      product_id,
      test_run_id,
      failed_test_case_ids,
    };

    const backendResponse = await fetch(
      constructUrl("CreateJiraTicketsForFailedTests"),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `${req.cookies.get(SESSION_TOKEN_COOKIE_NAME)?.value}`,
        },
        body: JSON.stringify(jiraTicketData),
      },
    );

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
    console.log("Jira tickets created successfully", result);
    return NextResponse.json(result, { status: HTTP_STATUS_OK });
  } catch (error) {
    Sentry.captureException(error, {
      level: "fatal",
      tags: { priority: "high" },
    });
    console.error(
      "Error in POST /api/create-jira-tickets-for-failed-tests:",
      error,
    );
    return NextResponse.json(
      { error: "Failed to create Jira tickets" },
      { status: HTTP_STATUS_INTERNAL_SERVER_ERROR },
    );
  }
}
