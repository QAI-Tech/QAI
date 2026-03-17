import { SESSION_TOKEN_COOKIE_NAME } from "@/lib/constants";
import { handleExpiredSessionToken } from "@/lib/handleExpiredSessionToken";
import { constructUrl } from "@/lib/urlUtlis";
import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();

    const response = await fetch(constructUrl("ReorderTestCases"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `${req.cookies.get(SESSION_TOKEN_COOKIE_NAME)?.value}`,
      },
      body: JSON.stringify(data),
    });

    if (response.status === 401) {
      return await handleExpiredSessionToken(req);
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error) {
    Sentry.captureMessage(JSON.stringify(error), {
      level: "fatal",
      tags: { priority: "high" },
    });
    console.error("Error while reordering test cases: ", error);
    return NextResponse.json(
      { error: "Failed to reorder test cases" },
      { status: 500 },
    );
  }
}
