import { constructUrl } from "@/lib/urlUtlis";
import { SESSION_TOKEN_COOKIE_NAME } from "@/lib/constants";
import { NextRequest, NextResponse } from "next/server";
import { handleExpiredSessionToken } from "@/lib/handleExpiredSessionToken";
import * as Sentry from "@sentry/nextjs";

export async function POST(req: NextRequest) {
  try {
    // Forward the incoming JSON body
    const body = await req.json();

    const response = await fetch(constructUrl("RequestKgTestCasePlanning"), {
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
      console.error("Backend error response:", errorData);
      Sentry.captureMessage(JSON.stringify(errorData), {
        level: "fatal",
        tags: { priority: "high" },
      });
      throw new Error(
        errorData.error || "Failed to request test cases from flows",
      );
    }

    const result = await response.json();
    console.log("Successfully requested test cases from flows:", result);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error while requesting test cases from flows:", error);
    Sentry.captureException(error, {
      level: "fatal",
      tags: { priority: "high" },
    });
    return NextResponse.json(
      { error: "Failed to request test cases from flows" },
      { status: 500 },
    );
  }
}
