import { NextRequest, NextResponse } from "next/server";
import { constructUrl } from "@/lib/urlUtlis";
import { handleExpiredSessionToken } from "@/lib/handleExpiredSessionToken";
import {
  SESSION_TOKEN_COOKIE_NAME,
  HTTP_STATUS_BAD_REQUEST,
  HTTP_STATUS_INTERNAL_SERVER_ERROR,
} from "@/lib/constants";
import * as Sentry from "@sentry/nextjs";

export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();

    // Validate required fields
    if (!id) {
      return NextResponse.json(
        { error: "Missing required field: id" },
        { status: HTTP_STATUS_BAD_REQUEST },
      );
    }

    const backendResponse = await fetch(constructUrl("DeleteJiraCredentials"), {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `${request.cookies.get(SESSION_TOKEN_COOKIE_NAME)?.value}`,
      },
      body: JSON.stringify({ id }),
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
    console.error("Error deleting Jira credentials:", error);
    Sentry.captureException(error, {
      level: "fatal",
      tags: { priority: "high" },
    });

    return NextResponse.json(
      { error: "Failed to delete Jira credentials" },
      { status: HTTP_STATUS_INTERNAL_SERVER_ERROR },
    );
  }
}
