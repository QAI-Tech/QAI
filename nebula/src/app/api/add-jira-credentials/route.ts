import { NextRequest, NextResponse } from "next/server";
import { constructUrl } from "@/lib/urlUtlis";
import { handleExpiredSessionToken } from "@/lib/handleExpiredSessionToken";
import {
  SESSION_TOKEN_COOKIE_NAME,
  HTTP_STATUS_BAD_REQUEST,
  HTTP_STATUS_INTERNAL_SERVER_ERROR,
} from "@/lib/constants";
import * as Sentry from "@sentry/nextjs";

export async function POST(request: NextRequest) {
  try {
    const { email, api_token, product_id, jira_project_key, jira_base_url } =
      await request.json();

    // Validate required fields
    if (
      !email ||
      !api_token ||
      !product_id ||
      !jira_project_key ||
      !jira_base_url
    ) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: email, api_token, product_id, jira_project_key, and jira_base_url are required",
        },
        { status: HTTP_STATUS_BAD_REQUEST },
      );
    }

    const backendResponse = await fetch(constructUrl("AddJiraCredentials"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `${request.cookies.get(SESSION_TOKEN_COOKIE_NAME)?.value}`,
      },
      body: JSON.stringify({
        email,
        api_token,
        product_id,
        jira_project_key,
        jira_base_url,
      }),
    });

    if (backendResponse.status === 401) {
      return await handleExpiredSessionToken(request);
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

    const data = await backendResponse.json();
    return NextResponse.json(data, { status: backendResponse.status });
  } catch (error) {
    console.error("Error adding Jira credentials:", error);
    Sentry.captureException(error, {
      level: "fatal",
      tags: { priority: "high" },
    });

    return NextResponse.json(
      { error: "Failed to add Jira credentials" },
      { status: HTTP_STATUS_INTERNAL_SERVER_ERROR },
    );
  }
}
