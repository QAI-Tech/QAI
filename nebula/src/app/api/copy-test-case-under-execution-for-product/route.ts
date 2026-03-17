import { SESSION_TOKEN_COOKIE_NAME } from "@/lib/constants";
import { handleExpiredSessionToken } from "@/lib/handleExpiredSessionToken";
import { constructUrl } from "@/lib/urlUtlis";
import { type NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

export async function POST(req: NextRequest) {
  try {
    const { from_product_id, to_product_id, tcue_ids, to_test_run_id } =
      await req.json();

    if (!from_product_id || !to_product_id || !tcue_ids) {
      Sentry.captureMessage(
        "from_product_id, to_product_id, and tcue_ids are required",
        {
          level: "fatal",
          tags: { priority: "high" },
        },
      );
      return NextResponse.json(
        {
          error: "from_product_id, to_product_id, and tcue_ids are required",
        },
        { status: 400 },
      );
    }

    if (!Array.isArray(tcue_ids) || tcue_ids.length === 0) {
      return NextResponse.json(
        { error: "tcue_ids array is required and must not be empty" },
        { status: 400 },
      );
    }

    console.log("Received request:", {
      from_product_id,
      to_product_id,
      tcue_ids,
      to_test_run_id,
    });

    // Fix: Use the correct field name that the backend expects
    const requestBody: {
      from_product_id: string;
      to_product_id: string;
      test_case_under_execution_ids: string[];
      to_test_run_id?: string;
    } = {
      from_product_id,
      to_product_id,
      test_case_under_execution_ids: tcue_ids,
    };

    // Only include to_test_run_id if it's provided and not empty otherwise orionis will take the latest test run
    if (to_test_run_id && to_test_run_id.trim() !== "") {
      requestBody.to_test_run_id = to_test_run_id;
    }

    const response = await fetch(
      constructUrl("CopyTestCaseUnderExecutionForProduct"),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `${req.cookies.get(SESSION_TOKEN_COOKIE_NAME)?.value}`,
        },
        body: JSON.stringify(requestBody),
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
        {
          error: errorData.error || "Failed to copy test cases under execution",
        },
        { status: response.status },
      );
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error) {
    Sentry.captureException(error, {
      level: "fatal",
      tags: { priority: "high" },
    });
    console.error("Error while copying test cases under execution:", error);
    return NextResponse.json(
      { error: "Failed to copy test cases under execution" },
      { status: 500 },
    );
  }
}
