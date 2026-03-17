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
    const body = await req.json();
    const { test_case_id, product_id, credentials, description, is_default } =
      body;

    if (test_case_id) {
      console.log("Adding credentials to test case:", body);
    } else {
      console.log("Adding credentials to product:", body);
    }

    if (!product_id || !credentials) {
      Sentry.captureMessage(
        "Missing required credential fields: product_id and credentials are required",
        {
          level: "fatal", // or "error"
          tags: { priority: "high" },
        },
      );
      console.log(
        "Missing required credential fields: product_id and credentials are required",
      );

      return NextResponse.json(
        {
          error:
            "Missing required credential fields: product_id and credentials are required",
        },
        { status: HTTP_STATUS_BAD_REQUEST },
      );
    }

    const payload = {
      test_case_id: test_case_id || null,
      product_id,
      credentials,
      description:
        description ||
        (test_case_id
          ? "Credentials for test case"
          : "Default Credentials for product"),
      is_default: is_default || false,
    };

    const backendResponse = await fetch(
      constructUrl("AddCredentialsToTestCaseOrProduct"),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `${req.cookies.get(SESSION_TOKEN_COOKIE_NAME)?.value}`,
        },
        body: JSON.stringify(payload),
      },
    );

    if (backendResponse.status === 401) {
      return await handleExpiredSessionToken(req);
    }

    if (!backendResponse.ok) {
      const errorData = await backendResponse.json();
      Sentry.captureMessage(JSON.stringify(errorData), {
        level: "fatal", // or "error"
        tags: { priority: "high" },
      });
      return NextResponse.json(
        { error: errorData.error || "Backend request failed" },
        { status: backendResponse.status },
      );
    }

    const result = await backendResponse.json();
    console.log("Credentials added successfully", result);
    return NextResponse.json(result, { status: HTTP_STATUS_OK });
  } catch (error) {
    Sentry.captureMessage(JSON.stringify(error), {
      level: "fatal", // or "error"
      tags: { priority: "high" },
    });
    console.error(
      "Error in POST /api/add-credentials-to-test-case-or-product:",
      error,
    );
    return NextResponse.json(
      { error: "Failed to add credentials to test_case/product" },
      { status: HTTP_STATUS_INTERNAL_SERVER_ERROR },
    );
  }
}
