import { constructUrl } from "@/lib/urlUtlis";
import { SESSION_TOKEN_COOKIE_NAME } from "@/lib/constants";
import { NextRequest, NextResponse } from "next/server";
import { handleExpiredSessionToken } from "@/lib/handleExpiredSessionToken";
import * as Sentry from "@sentry/nextjs";

export async function POST(req: NextRequest) {
  try {
    // Forward the incoming JSON body
    const body = await req.json();

    const response = await fetch(constructUrl("TriggerApiRequest"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `${req.cookies.get(SESSION_TOKEN_COOKIE_NAME)?.value}`,
      },
      body: JSON.stringify(body),
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
      console.log("Backend error response:", errorData);
      throw new Error(errorData.error || "Failed to trigger API request");
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error) {
    console.log("Error while triggering API call: ", error);
    Sentry.captureException(error, {
      level: "fatal",
      tags: { priority: "high" },
    });
    return NextResponse.json(
      { error: `Failed to trigger API call: ${(error as Error).message}` },
      { status: 500 },
    );
  }
}
