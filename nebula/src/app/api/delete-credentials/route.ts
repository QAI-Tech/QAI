import { NextRequest, NextResponse } from "next/server";
import {
  HTTP_STATUS_OK,
  SESSION_TOKEN_COOKIE_NAME,
  HTTP_STATUS_BAD_REQUEST,
  HTTP_STATUS_INTERNAL_SERVER_ERROR,
} from "@/lib/constants";
import { handleExpiredSessionToken } from "@/lib/handleExpiredSessionToken";
import { constructUrl } from "@/lib/urlUtlis";
import * as Sentry from "@sentry/nextjs";

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { credentials_id, product_id } = body;

    if (!credentials_id || !product_id) {
      console.log(
        "Missing required fields: credentials_id and product_id are required",
      );
      Sentry.captureMessage(
        "Missing required fields: credentials_id and product_id are required",
        {
          level: "fatal",
          tags: { priority: "high" },
        },
      );
      return NextResponse.json(
        {
          error:
            "Missing required fields: credentials_id and product_id are required",
        },
        { status: HTTP_STATUS_BAD_REQUEST },
      );
    }

    const backendResponse = await fetch(constructUrl("DeleteCredentials"), {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `${req.cookies.get(SESSION_TOKEN_COOKIE_NAME)?.value}`,
      },
      body: JSON.stringify({
        credentials_id,
        product_id,
      }),
    });

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
    console.log("Credentials deleted successfully", result);
    return NextResponse.json(result, { status: HTTP_STATUS_OK });
  } catch (error) {
    console.error("Error in POST /api/delete-credentials:", error);
    Sentry.captureException(error, {
      level: "fatal",
      tags: { priority: "high" },
    });
    return NextResponse.json(
      { error: "Failed to delete credentials" },
      { status: HTTP_STATUS_INTERNAL_SERVER_ERROR },
    );
  }
}
