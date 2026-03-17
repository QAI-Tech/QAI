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

export async function DELETE(req: NextRequest) {
  try {
    const data = await req.json();
    if (!data.product_id) {
      console.log("Product ID is missing");
      Sentry.captureMessage("Product ID is required", {
        level: "error",
        tags: { priority: "high" },
      });
      return NextResponse.json(
        { error: "Product ID is required" },
        { status: HTTP_STATUS_BAD_REQUEST },
      );
    }

    const backendResponse = await fetch(constructUrl("DeleteProduct"), {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `${req.cookies.get(SESSION_TOKEN_COOKIE_NAME)?.value}`,
      },
      body: JSON.stringify(data),
    });

    if (backendResponse.status === 401) {
      return await handleExpiredSessionToken(req);
    }

    // Handle backend response
    if (!backendResponse.ok) {
      const errorData = await backendResponse.json();
      Sentry.captureMessage(JSON.stringify(errorData), {
        level: "error",
        tags: { priority: "high" },
      });
      return NextResponse.json(
        { error: errorData.error || "Backend request failed" },
        { status: backendResponse.status },
      );
    }

    const result = await backendResponse.json();
    console.log("Product Deleted Successfully", result);
    return NextResponse.json(result, { status: HTTP_STATUS_OK });
  } catch (error) {
    Sentry.captureException(error, {
      level: "error",
      tags: { priority: "high" },
    });
    console.error("Error in DELETE /api/delete-product:", error);
    return NextResponse.json(
      { error: "Failed to delete product" },
      { status: HTTP_STATUS_INTERNAL_SERVER_ERROR },
    );
  }
}
