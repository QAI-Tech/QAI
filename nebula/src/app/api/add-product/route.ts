import { NextRequest, NextResponse } from "next/server";
import {
  HTTP_STATUS_OK,
  SESSION_TOKEN_COOKIE_NAME,
  HTTP_STATUS_BAD_REQUEST,
  HTTP_STATUS_INTERNAL_SERVER_ERROR,
} from "@/lib/constants";
import * as Sentry from "@sentry/nextjs";
import { handleExpiredSessionToken } from "@/lib/handleExpiredSessionToken";
import { constructUrl } from "@/lib/urlUtlis";

// interface for the payload structure
interface AddProductPayload {
  google_play_store_url?: string;
  apple_app_store_url?: string;
  product_name: string;
  web_url?: string;
  organisation_id: string;
  default_credentials?: {
    credentials: Record<string, string>;
    description: string;
    is_default?: boolean;
  };
}

export async function POST(req: NextRequest) {
  try {
    // Directly extract request body
    const body = await req.json();
    const {
      google_play_store_url,
      apple_app_store_url,
      product_name,
      web_url,
      organisation_id,
      default_credentials,
    } = body;

    console.log(body);
    console.log(
      google_play_store_url,
      apple_app_store_url,
      product_name,
      web_url,
      organisation_id,
    );

    // Validate required fields
    if (
      !product_name ||
      !organisation_id ||
      !(google_play_store_url || apple_app_store_url || web_url)
    ) {
      console.log("Missing required product fields");
      Sentry.captureMessage("Missing required product fields", {
        level: "fatal", // or "error"
        tags: { priority: "high" },
      });
      return NextResponse.json(
        { error: "Missing required product fields" },
        { status: HTTP_STATUS_BAD_REQUEST },
      );
    }

    const payload: AddProductPayload = {
      google_play_store_url,
      apple_app_store_url,
      product_name,
      web_url,
      organisation_id,
    };

    // Add default_credentials if provided
    if (default_credentials && default_credentials.credentials) {
      payload.default_credentials = default_credentials;
    }

    const backendResponse = await fetch(constructUrl("AddProduct"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `${req.cookies.get(SESSION_TOKEN_COOKIE_NAME)?.value}`,
      },
      body: JSON.stringify(payload),
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
    console.log("Product Added Successfully", result);
    return NextResponse.json(result, { status: HTTP_STATUS_OK });
  } catch (error) {
    console.error("Error in POST /api/add-product:", error);
    Sentry.captureException(error, {
      level: "fatal",
      tags: { priority: "high" },
    });
    return NextResponse.json(
      { error: "Failed to add product" },
      { status: HTTP_STATUS_INTERNAL_SERVER_ERROR },
    );
  }
}
