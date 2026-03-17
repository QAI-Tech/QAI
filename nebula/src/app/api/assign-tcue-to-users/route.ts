import {
  HTTP_STATUS_BAD_REQUEST,
  HTTP_STATUS_INTERNAL_SERVER_ERROR,
  HTTP_STATUS_OK,
  SESSION_TOKEN_COOKIE_NAME,
} from "@/lib/constants";
import { handleExpiredSessionToken } from "@/lib/handleExpiredSessionToken";
import { constructUrl } from "@/lib/urlUtlis";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { test_case_under_execution_ids, assignee_user_id } =
      await req.json();

    if (
      !test_case_under_execution_ids ||
      !Array.isArray(test_case_under_execution_ids) ||
      test_case_under_execution_ids.length === 0 ||
      !assignee_user_id
    ) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: test_case_under_execution_ids (array) and assignee_user_id are required",
        },
        { status: HTTP_STATUS_BAD_REQUEST },
      );
    }

    const response = await fetch(constructUrl("AssignTcueToUsers"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `${req.cookies.get(SESSION_TOKEN_COOKIE_NAME)?.value}`,
      },
      body: JSON.stringify({
        test_case_under_execution_ids,
        assignee_user_id,
      }),
    });

    if (response.status === 401) {
      return await handleExpiredSessionToken(req);
    }

    if (!response.ok) {
      const errorData = await response.json();
      return NextResponse.json(
        { error: errorData.error || "Failed to assign test cases to user" },
        { status: response.status },
      );
    }

    const result = await response.json();
    console.log("Test cases assigned successfully:", result);
    return NextResponse.json(result, { status: HTTP_STATUS_OK });
  } catch (error) {
    console.error("Error in POST /api/assign-tcue-to-users:", error);
    return NextResponse.json(
      { error: "Failed to assign test cases to user" },
      { status: HTTP_STATUS_INTERNAL_SERVER_ERROR },
    );
  }
}
