import { SESSION_TOKEN_COOKIE_NAME } from "@/lib/constants";
import { handleExpiredSessionToken } from "@/lib/handleExpiredSessionToken";
import { constructUrl } from "@/lib/urlUtlis";
import { type NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

export async function POST(req: NextRequest) {
  try {
    const {
      from_product_id,
      to_product_id,
      test_case_ids,
      should_establish_test_case_links,
    } = await req.json();

    if (!from_product_id || !to_product_id || !test_case_ids) {
      Sentry.captureMessage(
        "from_product_id, to_product_id, and test_case_ids are required",
        {
          level: "fatal",
          tags: { priority: "high" },
        },
      );
      return NextResponse.json(
        {
          error:
            "from_product_id, to_product_id, and test_case_ids are required",
        },
        { status: 400 },
      );
    }

    if (!Array.isArray(test_case_ids) || test_case_ids.length === 0) {
      return NextResponse.json(
        { error: "test_case_ids array is required and must not be empty" },
        { status: 400 },
      );
    }

    console.log("Sending to backend:", {
      from_product_id,
      to_product_id,
      test_case_ids,
      should_establish_test_case_links,
    });

    const response = await fetch(constructUrl("CopyTestCasesForProduct"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `${req.cookies.get(SESSION_TOKEN_COOKIE_NAME)?.value}`,
      },
      body: JSON.stringify({
        from_product_id,
        to_product_id,
        test_case_ids,
        should_establish_test_case_links,
      }),
    });

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
    console.log("Backend success response:", result);
    return NextResponse.json(result);
  } catch (error) {
    Sentry.captureException(error, {
      level: "fatal",
      tags: { priority: "high" },
    });
    console.error("Error while copying test cases:", error);
    return NextResponse.json(
      { error: "Failed to copy test cases to product" },
      { status: 500 },
    );
  }
}
