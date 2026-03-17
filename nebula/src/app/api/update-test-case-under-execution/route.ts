import {
  HTTP_STATUS_INTERNAL_SERVER_ERROR,
  SESSION_TOKEN_COOKIE_NAME,
} from "@/lib/constants";
import { handleExpiredSessionToken } from "@/lib/handleExpiredSessionToken";
import { constructUrl } from "@/lib/urlUtlis";
import { type NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

export async function POST(req: NextRequest) {
  try {
    const { updateTestCaseUnderExecution } = await req.json();
    const {
      test_case_under_execution_id,
      status,
      notes,
      comments,
      execution_video_url,
      screenshot_url,
      criticality,
      test_case_id,
      test_case_description,
      test_case_steps,
      preconditions,
      feature_id,
      is_synced,
      annotations,
      scenario_parameters,
    } = updateTestCaseUnderExecution;

    const response = await fetch(constructUrl("UpdateTestCaseUnderExecution"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `${req.cookies.get(SESSION_TOKEN_COOKIE_NAME)?.value}`,
      },
      body: JSON.stringify({
        test_case_under_execution_id,
        status,
        notes,
        comments,
        execution_video_url,
        screenshot_url,
        criticality,
        test_case_id,
        test_case_description,
        test_case_steps,
        preconditions,
        feature_id,
        is_synced,
        annotations,
        scenario_parameters,
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
    console.log("Updated test case", result);
    return NextResponse.json(result);
  } catch (error) {
    Sentry.captureException(error, {
      level: "fatal",
      tags: { priority: "high" },
    });
    console.log("Error while updating the test case under execution: ", error);
    return NextResponse.json(
      { error: "Failed to update the test case under execution" },
      { status: HTTP_STATUS_INTERNAL_SERVER_ERROR },
    );
  }
}
