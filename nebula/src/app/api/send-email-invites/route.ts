import {
  HTTP_STATUS_INTERNAL_SERVER_ERROR,
  SESSION_TOKEN_COOKIE_NAME,
} from "@/lib/constants";
import { handleExpiredSessionToken } from "@/lib/handleExpiredSessionToken";
import { constructUrl } from "@/lib/urlUtlis";
import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@/lib/types";
import * as Sentry from "@sentry/nextjs";

interface InviteDetails {
  email: string;
  role: UserRole;
}

export async function POST(req: NextRequest) {
  try {
    const { invites } = await req.json();
    const inviteDetails: InviteDetails[] = invites;

    const response = await fetch(constructUrl("SendEmailInvites"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `${req.cookies.get(SESSION_TOKEN_COOKIE_NAME)?.value}`,
      },
      body: JSON.stringify({
        invites: inviteDetails,
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
    console.log("Email invites sent:", result);
    return NextResponse.json(result);
  } catch (error) {
    Sentry.captureException(error, {
      level: "fatal",
      tags: { priority: "high" },
    });
    console.error("Error while sending email invites: ", error);
    return NextResponse.json(
      { error: "Failed to send email invites" },
      { status: HTTP_STATUS_INTERNAL_SERVER_ERROR },
    );
  }
}
