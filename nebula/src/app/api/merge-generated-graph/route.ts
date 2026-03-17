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
    const { product_id, request_id, y_offset } = await req.json();

    if (!product_id) {
      Sentry.captureMessage("Product ID is missing", {
        level: "fatal",
        tags: { priority: "high" },
      });
      return NextResponse.json(
        { error: "product_id is required" },
        { status: HTTP_STATUS_BAD_REQUEST },
      );
    }

    if (!request_id) {
      Sentry.captureMessage("Request ID is missing", {
        level: "fatal",
        tags: { priority: "high" },
      });
      return NextResponse.json(
        { error: "request_id is required" },
        { status: HTTP_STATUS_BAD_REQUEST },
      );
    }

    const backendPayload: {
      product_id: string;
      request_id: string;
      y_offset?: number;
    } = { product_id, request_id };
    if (typeof y_offset === "number") {
      backendPayload.y_offset = y_offset;
    }

    const backendResponse = await fetch(constructUrl("MergeGeneratedGraph"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `${req.cookies.get(SESSION_TOKEN_COOKIE_NAME)?.value}`,
      },
      body: JSON.stringify(backendPayload),
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
    console.log("Graph merged successfully", result);
    return NextResponse.json(result, { status: HTTP_STATUS_OK });
  } catch (error) {
    Sentry.captureException(error, {
      level: "fatal",
      tags: { priority: "high" },
    });
    console.error("Error in POST /api/merge-generated-graph:", error);
    return NextResponse.json(
      { error: "Failed to merge graph" },
      { status: HTTP_STATUS_INTERNAL_SERVER_ERROR },
    );
  }
}
