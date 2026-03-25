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

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const product_id = searchParams.get("product_id");

    if (!product_id) {
      Sentry.captureMessage("Product ID is missing for get test suites", {
        level: "fatal",
        tags: { priority: "high" },
      });
      return NextResponse.json(
        { error: "Product ID is required" },
        { status: HTTP_STATUS_BAD_REQUEST },
      );
    }

    const backendResponse = await fetch(
      constructUrl(`GetTestSuites?product_id=${product_id}`),
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `${req.cookies.get(SESSION_TOKEN_COOKIE_NAME)?.value}`,
        },
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
    return NextResponse.json(result, { status: HTTP_STATUS_OK });
  } catch (error) {
    Sentry.captureException(error, {
      level: "fatal",
      tags: { priority: "high" },
    });
    console.error("Error in GET /api/get-test-suites-for-product:", error);
    return NextResponse.json(
      { error: "Failed to fetch test suites" },
      { status: HTTP_STATUS_INTERNAL_SERVER_ERROR },
    );
  }
}
