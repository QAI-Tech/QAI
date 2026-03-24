import {
  HTTP_STATUS_INTERNAL_SERVER_ERROR,
  SESSION_TOKEN_COOKIE_NAME,
} from "@/lib/constants";
import * as Sentry from "@sentry/nextjs";
import { handleExpiredSessionToken } from "@/lib/handleExpiredSessionToken";
import { constructUrl } from "@/lib/urlUtlis";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { addOrg } = await req.json();
    const { organisation_name } = addOrg;
    // const { userId } = auth();
    const payload = {
      organisation_name: organisation_name,
    };
    const response = await fetch(constructUrl("AddOrg"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `${req.cookies.get(SESSION_TOKEN_COOKIE_NAME)?.value}`,
      },
      body: JSON.stringify(payload),
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
    console.log("Updated User details", result);
    // const clerk = clerkClient();
    // await clerk.users.updateUser(userId as string, {
    //   publicMetadata: {
    //     first_name: firstNameClerk, // Custom field name
    //     last_name_clerk: lastNameClerk, // Custom field name
    //     userEmail: email, // Custom field name
    //     organisation_id: result.organisation_id, // Custom field name
    //   },
    // });

    return NextResponse.json(result);
  } catch (error) {
    Sentry.captureException(error, {
      level: "fatal",
      tags: { priority: "high" },
    });
    console.error("Error in POST handler:", error);
    return NextResponse.json(
      { error: "Failed to update user details" },
      { status: HTTP_STATUS_INTERNAL_SERVER_ERROR },
    );
  }
}
