import {
  HTTP_STATUS_INTERNAL_SERVER_ERROR,
  SESSION_TOKEN_COOKIE_NAME,
} from "@/lib/constants";
import { handleExpiredSessionToken } from "@/lib/handleExpiredSessionToken";
import { constructUrl } from "@/lib/urlUtlis";
import { type NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

export async function POST(req: NextRequest) {
  try {
    const { business_logic, edge_id } = await req.json();

    if (!business_logic) {
      return NextResponse.json(
        { error: "business_logic is required" },
        { status: 400 },
      );
    }

    if (!edge_id) {
      return NextResponse.json(
        { error: "edge_id is required" },
        { status: 400 },
      );
    }

    const response = await fetch(constructUrl("CallLLM"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `${req.cookies.get(SESSION_TOKEN_COOKIE_NAME)?.value}`,
      },
      body: JSON.stringify({
        business_logic,
        edge_id,
      }),
    });

    if (response.status === 401) {
      return await handleExpiredSessionToken(req);
    }

    if (!response.ok) {
      const errorData = await response.json();
      Sentry.captureException(errorData, {
        level: "fatal",
        tags: { priority: "high" },
      });
      return NextResponse.json(
        { error: errorData.error || "Backend request failed" },
        { status: response.status },
      );
    }

    const result = await response.json();
    console.log("LLM formatting result", result);
    return NextResponse.json(result);
  } catch (error) {
    Sentry.captureException(error, {
      level: "fatal",
      tags: { priority: "high" },
    });
    return NextResponse.json(
      {
        error: `Failed to format business logic: ${(error as Error).message || error}`,
      },
      { status: HTTP_STATUS_INTERNAL_SERVER_ERROR },
    );
  }
}
