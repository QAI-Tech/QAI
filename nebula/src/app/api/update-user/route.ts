import {
  HTTP_STATUS_INTERNAL_SERVER_ERROR,
  SESSION_TOKEN_COOKIE_NAME,
} from "@/lib/constants";
import { handleExpiredSessionToken } from "@/lib/handleExpiredSessionToken";
import { constructUrl } from "@/lib/urlUtlis";
import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

export async function POST(req: NextRequest) {
  try {
    const { updateUserDetails } = await req.json();
    const { first_name, last_name, email, organisation_id } = updateUserDetails;

    const response = await fetch(constructUrl("UpdateUserDetails"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `${req.cookies.get(SESSION_TOKEN_COOKIE_NAME)?.value}`,
      },
      body: JSON.stringify({
        organisation_id,
        first_name,
        last_name,
        email,
      }),
    });

    if (response.status === 401) {
      return await handleExpiredSessionToken(req);
    }
    const result = await response.json();
    console.log("Updated User details", result);
    return NextResponse.json(result);
  } catch (error) {
    console.log("Error while updating user detail: ", error);
    Sentry.captureException(error, {
      level: "fatal",
      tags: { priority: "high" },
    });
    return NextResponse.json(
      { error: "Failed to update user details" },
      { status: HTTP_STATUS_INTERNAL_SERVER_ERROR },
    );
  }
}
