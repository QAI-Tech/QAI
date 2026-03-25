import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { constructUrl } from "@/lib/urlUtlis";
import { handleExpiredSessionToken } from "@/lib/handleExpiredSessionToken";
import {
  SESSION_TOKEN_COOKIE_NAME,
  HTTP_STATUS_BAD_REQUEST,
  HTTP_STATUS_NOT_FOUND,
  HTTP_STATUS_OK,
  HTTP_STATUS_INTERNAL_SERVER_ERROR,
} from "@/lib/constants";
import * as Sentry from "@sentry/nextjs";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // Extract query parameters
    const productId = request.nextUrl.searchParams.get("product_id");
    console.log(productId);
    // Validate product_id
    if (!productId) {
      Sentry.captureMessage("ProductId is required", {
        level: "fatal",
        tags: { priority: "high" },
      });
      return NextResponse.json(
        { error: "product_id is required" },
        { status: HTTP_STATUS_BAD_REQUEST },
      );
    }

    // Call your backend API
    const backendResponse = await fetch(
      constructUrl(`GetFeaturesUsingProductID?product_id=${productId}`),
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

    const features = await backendResponse.json();

    // Check if test cases are found
    if (!features) {
      return NextResponse.json(
        { error: "No features found for this product ID." },
        { status: HTTP_STATUS_NOT_FOUND },
      );
    }
    console.log(features);
    // Return the test cases
    return NextResponse.json(features, { status: HTTP_STATUS_OK });
  } catch (error) {
    console.error("Error in GET /api/get_features_using_product_id:", error);
    Sentry.captureException(error, {
      level: "fatal",
      tags: { priority: "high" },
    });
    return NextResponse.json(
      { error: "Failed to get features using product id" },
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
