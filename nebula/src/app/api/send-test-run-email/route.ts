import { SESSION_TOKEN_COOKIE_NAME } from "@/lib/constants";
import { handleExpiredSessionToken } from "@/lib/handleExpiredSessionToken";
import { constructUrl } from "@/lib/urlUtlis";
import { type NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

export async function POST(req: NextRequest) {
  try {
    const { test_run_id } = await req.json();

    const response = await fetch(constructUrl("SendTestRunEmail"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `${req.cookies.get(SESSION_TOKEN_COOKIE_NAME)?.value}`,
      },
      body: JSON.stringify({ test_run_id }),
    });

    if (response.status === 401) {
      return await handleExpiredSessionToken(req);
    }

    const result = await response.json();

    if (!response.ok) {
      Sentry.captureMessage(JSON.stringify(result), {
        level: "fatal",
        tags: { priority: "high" },
      });
      return NextResponse.json(
        { error: result.error || "Backend request failed" },
        { status: response.status },
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    Sentry.captureException(error, {
      level: "fatal",
      tags: { priority: "high" },
    });
    console.error("Error while sending test run email: ", error);
    return NextResponse.json(
      { error: "Failed to send test run email" },
      { status: 500 },
    );
  }
}
