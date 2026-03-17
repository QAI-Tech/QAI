import { NextRequest, NextResponse } from "next/server";
import { constructUrl } from "@/lib/urlUtlis";
import { handleExpiredSessionToken } from "@/lib/handleExpiredSessionToken";
import * as Sentry from "@sentry/nextjs";
import {
  SESSION_TOKEN_COOKIE_NAME,
  HTTP_STATUS_BAD_REQUEST,
  HTTP_STATUS_INTERNAL_SERVER_ERROR,
  HTTP_STATUS_OK,
} from "@/lib/constants";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const organisationId = searchParams.get("organisation_id");

    if (!organisationId) {
      Sentry.captureMessage("Organisation ID is required", {
        level: "fatal",
        tags: { priority: "high" },
      });
      return NextResponse.json(
        { error: "Organisation ID is required" },
        { status: HTTP_STATUS_BAD_REQUEST },
      );
    }

    const backendResponse = await fetch(
      constructUrl(`GetUsersWithOrgId?organisation_id=${organisationId}`),
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
    return NextResponse.json(data, { status: HTTP_STATUS_OK });
  } catch (error) {
    Sentry.captureException(error, {
      level: "fatal",
      tags: { priority: "high" },
    });
    console.error("Error in get-users-with-org-id:", error);
    return NextResponse.json(
      { error: "Failed to get users with org id" },
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
