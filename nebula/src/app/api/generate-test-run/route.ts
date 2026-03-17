import { NextRequest, NextResponse } from "next/server";
import { SESSION_TOKEN_COOKIE_NAME } from "@/lib/constants";
import { handleExpiredSessionToken } from "@/lib/handleExpiredSessionToken";
import { constructUrl } from "@/lib/urlUtlis";
import * as Sentry from "@sentry/nextjs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { testCases } = body;
    const backendResponse = await fetch(constructUrl("createTestRun"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${
          req.cookies.get(SESSION_TOKEN_COOKIE_NAME)?.value
        }`,
      },
      body: JSON.stringify({ testCases }),
    });

    if (backendResponse.status === 401) {
      return await handleExpiredSessionToken(req);
    }

    const result = await backendResponse.json();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error generating test run:", error);
    Sentry.captureException(error, {
      level: "fatal",
      tags: { priority: "high" },
    });
    return NextResponse.json(
      { error: "Error generating test run" },
      { status: 500 },
    );
  }
}
