import {
  HTTP_STATUS_INTERNAL_SERVER_ERROR,
  SESSION_TOKEN_COOKIE_NAME,
} from "@/lib/constants";
import { handleExpiredSessionToken } from "@/lib/handleExpiredSessionToken";
import { constructUrl } from "@/lib/urlUtlis";
import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const product_id = searchParams.get("product_id");
    if (!product_id) {
      Sentry.captureMessage("Missing product_id in query parameters", {
        level: "fatal",
        tags: { priority: "high" },
      });
      return NextResponse.json(
        { error: "Missing product_id" },
        { status: 400 },
      );
    }
    console.log(product_id);
    const response = await fetch(
      `${constructUrl("GetTestRunsForProduct")}?product_id=${product_id}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `${req.cookies.get(SESSION_TOKEN_COOKIE_NAME)?.value}`,
        },
      },
    );

    if (response.status === 401) {
      return await handleExpiredSessionToken(req);
    }
    if (!response.ok) {
      const errorData = await response.json();
      Sentry.captureMessage(JSON.stringify(errorData), {
        level: "fatal",
        tags: { priority: "high" },
      });
      return NextResponse.json(
        { error: errorData.error || "Backend request failed" },
        { status: response.status },
      );
    }
    const result = await response.json();
    console.log(result);
    return NextResponse.json(result);
  } catch (error) {
    Sentry.captureException(error, {
      level: "fatal",
      tags: { priority: "high" },
    });
    console.error("Error processing request: ", error);
    return NextResponse.json(
      { error: "Failed to get test runs" },
      { status: HTTP_STATUS_INTERNAL_SERVER_ERROR },
    );
  }
}
