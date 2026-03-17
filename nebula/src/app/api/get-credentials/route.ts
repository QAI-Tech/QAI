import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  HTTP_STATUS_OK,
  SESSION_TOKEN_COOKIE_NAME,
  HTTP_STATUS_BAD_REQUEST,
  HTTP_STATUS_INTERNAL_SERVER_ERROR,
} from "@/lib/constants";
import { handleExpiredSessionToken } from "@/lib/handleExpiredSessionToken";
import { constructUrl } from "@/lib/urlUtlis";
import * as Sentry from "@sentry/nextjs";

export async function GET(request: NextRequest) {
  try {
    const { userId } = auth();
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const productId = searchParams.get("productId");

    if (!productId) {
      Sentry.captureMessage("ProductId is required", {
        level: "fatal",
        tags: { priority: "high" },
      });
      return NextResponse.json(
        { error: "Product ID is required" },
        { status: HTTP_STATUS_BAD_REQUEST },
      );
    }

    const backendResponse = await fetch(
      constructUrl(`GetCredentials?product_id=${productId}`),
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
      return NextResponse.json(
        { error: errorData.error || "Backend request failed" },
        { status: backendResponse.status },
      );
    }

    const data = await backendResponse.json();
    return NextResponse.json(data, { status: HTTP_STATUS_OK });
  } catch (error) {
    console.error("[GET_CREDENTIALS]", error);
    Sentry.captureException(error, {
      level: "fatal",
      tags: { priority: "high" },
    });
    return NextResponse.json(
      { error: "Failed to get credentials" },
      { status: HTTP_STATUS_INTERNAL_SERVER_ERROR },
    );
  }
}
