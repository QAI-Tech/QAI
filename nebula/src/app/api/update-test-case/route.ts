import { SESSION_TOKEN_COOKIE_NAME } from "@/lib/constants";
import { handleExpiredSessionToken } from "@/lib/handleExpiredSessionToken";
import type { testCaseSchema } from "@/lib/types";
import { constructUrl } from "@/lib/urlUtlis";
import { type NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import * as Sentry from "@sentry/nextjs";

const normalizeTestCase = (testCase: testCaseSchema): testCaseSchema => ({
  ...testCase,
  test_case_id: String(testCase.test_case_id),
  created_at: new Date(testCase.created_at).toISOString(),
  test_case_steps: testCase.test_case_steps.map((step) => ({
    ...step,
    test_step_id: step.test_step_id || uuidv4(),
  })),
  status: testCase.status,
});

export async function POST(req: NextRequest) {
  try {
    const { testCase } = await req.json();
    const updatedTestCases = normalizeTestCase(testCase);
    console.log("Updated_test_case:", JSON.stringify(updatedTestCases));

    const response = await fetch(constructUrl("UpdateTestCase"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `${req.cookies.get(SESSION_TOKEN_COOKIE_NAME)?.value}`,
      },
      body: JSON.stringify(updatedTestCases),
    });

    if (response.status === 401) {
      return await handleExpiredSessionToken(req);
    }

    const result = await response.json();
    console.log("Updated test case", result);

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

    return NextResponse.json(result);
  } catch (error) {
    Sentry.captureException(error, {
      level: "fatal",
      tags: { priority: "high" },
    });
    console.error("Error while updating the test case: ", error);
    return NextResponse.json(
      { error: "Failed to update test case" },
      { status: 500 },
    );
  }
}
